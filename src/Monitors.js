const w32disp = require("win32-displayconfig");
const { exec } = require('child_process');
const Logger = require('./Logger');
require("os").setPriority(0, require("os").constants.priority.PRIORITY_BELOW_NORMAL)

let monitors = {}
let settings = {}
let ddcci = null

function getDDCCI() {
    if (ddcci) return ddcci;
    try {
        // Correcting the module name to @hensm/ddcci
        ddcci = require("@hensm/ddcci");
        Logger.info("DDC/CI module loaded successfully.");
        return ddcci;
    } catch (e) {
        Logger.error("DDC/CI module not available", e);
        return null;
    }
}

function setVCP(code, value, id) {
    Logger.info(`Setting VCP ${code} for ${id} to ${value}`);
    const ddc = getDDCCI()
    if (ddc) {
        try {
            ddc.setVCP(id, code, value)
        } catch (e) {
            Logger.error(`Failed to set DDC/CI VCP for ${id}`, e);
        }
    }
}

process.on('message', async (data) => {
    try {
        if (data.type === "refreshMonitors") {
            Logger.info("Refreshing monitors...");
            refreshMonitors().then((results) => {
                process.send({ type: 'refreshMonitors', monitors: results })
                Logger.info(`Refresh complete. Found ${Object.keys(results).length} monitors.`);
            })
        } else if (data.type === "brightness") {
            setBrightness(data.brightness, data.id)
        } else if (data.type === "vcp") {
            setVCP(data.code, data.value, data.id)
        } else if (data.type === "settings") {
            settings = data.settings
        }
    } catch (e) {
        Logger.error("Error in Monitor thread message handler", e);
    }
})

async function refreshMonitors() {
    const foundMonitors = {}
    
    // 1. Get Detailed Monitor Info from Win32 API
    let displayConfigs = []
    try {
        displayConfigs = await w32disp.extractDisplayConfig()
        Logger.info(`Win32 DisplayConfig found ${displayConfigs.length} displays.`);
    } catch (e) {
        Logger.error("Failed to extract display config via Win32 API", e);
    }

    // 2. Get DDC/CI Monitors
    const ddc = getDDCCI()
    if (ddc) {
        try {
            const ddcList = ddc.getMonitorList()
            Logger.info(`DDC/CI found ${ddcList.length} potential monitors.`);
            
            for (const id of ddcList) {
                // Try to match DDC ID with Win32 Display Config
                const match = displayConfigs.find(c => id.toLowerCase().includes(c.devicePath.toLowerCase()) || c.devicePath.toLowerCase().includes(id.toLowerCase()))
                
                const hwid = id.split("#")
                const key = hwid[2] || id
                
                foundMonitors[key] = {
                    id,
                    hwid,
                    name: match ? match.displayName : "External Display",
                    type: "ddcci",
                    brightness: 50 // Default, will try to get actual
                }

                try {
                    foundMonitors[key].brightness = ddc.getBrightness(id)
                } catch (e) {
                    Logger.warn(`Could not get brightness for ${key}: ${e.message}`);
                }
            }
        } catch (e) { 
            Logger.error("DDC/CI refresh failed", e);
        }
    }

    // 3. Get Internal (WMI) Brightness
    try {
        const wmiBrightness = await getInternalBrightness()
        if (wmiBrightness !== null) {
            foundMonitors["INTERNAL"] = {
                id: "INTERNAL",
                name: "Internal Display",
                type: "wmi",
                brightness: wmiBrightness
            }
            Logger.info("Internal display detected.");
        }
    } catch (e) { 
        Logger.error("WMI brightness detection failed", e);
    }

    monitors = foundMonitors
    return foundMonitors
}

function getInternalBrightness() {
    return new Promise((resolve) => {
        exec('powershell "Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -ExpandProperty CurrentBrightness"', (err, stdout) => {
            if (err) resolve(null)
            else resolve(parseInt(stdout.trim()))
        })
    })
}

function setBrightness(level, id) {
    Logger.info(`Setting brightness for ${id} to ${level}`);
    if (id === "INTERNAL") {
        exec(`powershell "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(0, ${level})"`)
    } else {
        const ddc = getDDCCI()
        if (ddc) {
            try {
                ddc.setBrightness(id, level)
            } catch (e) {
                Logger.error(`Failed to set DDC/CI brightness for ${id}`, e);
            }
        }
    }
}
const w32disp = require("win32-displayconfig");
const { exec } = require('child_process');
require("os").setPriority(0, require("os").constants.priority.PRIORITY_BELOW_NORMAL)

let monitors = {}
let settings = {}
let ddcci = null

function getDDCCI() {
    if (ddcci) return ddcci;
    try {
        ddcci = require("@sidneys/node-ddcci");
        return ddcci;
    } catch (e) {
        console.error("DDC/CI not available", e);
        return null;
    }
}

process.on('message', async (data) => {
    try {
        if (data.type === "refreshMonitors") {
            refreshMonitors().then((results) => {
                process.send({ type: 'refreshMonitors', monitors: results })
            })
        } else if (data.type === "brightness") {
            setBrightness(data.brightness, data.id)
        } else if (data.type === "settings") {
            settings = data.settings
        }
    } catch (e) {
        console.error(e)
    }
})

async function refreshMonitors() {
    const foundMonitors = {}
    
    // 1. Get DDC/CI Monitors
    const ddc = getDDCCI()
    if (ddc) {
        try {
            const ddcList = ddc.getMonitorList()
            for (const id of ddcList) {
                const hwid = id.split("#")
                foundMonitors[hwid[2]] = {
                    id,
                    hwid,
                    name: "External Display",
                    type: "ddcci",
                    brightness: ddc.getBrightness(id)
                }
            }
        } catch (e) { console.error("DDC/CI refresh failed", e) }
    }

    // 2. Get Internal (WMI) Brightness
    try {
        // Fallback for internal displays using PowerShell (simplified WMI)
        const wmiBrightness = await getInternalBrightness()
        if (wmiBrightness !== null) {
            foundMonitors["INTERNAL"] = {
                id: "INTERNAL",
                name: "Internal Display",
                type: "wmi",
                brightness: wmiBrightness
            }
        }
    } catch (e) { }

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
    if (id === "INTERNAL") {
        exec(`powershell "(Get-WmiObject -Namespace root/WMI -Class WmiMonitorBrightnessMethods).WmiSetBrightness(0, ${level})"`)
    } else {
        const ddc = getDDCCI()
        if (ddc) ddc.setBrightness(id, level)
    }
}
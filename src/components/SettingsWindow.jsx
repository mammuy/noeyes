import React, { PureComponent } from "react";
import Titlebar from './Titlebar'
import { SettingsOption, SettingsChild } from "./SettingsOption";
import SafeRender from "./SafeRender";

export default class SettingsWindow extends PureComponent {
    constructor(props) {
        super(props)
        this.state = {
            monitors: [],
            names: window.settings.names || {}
        }
    }

    componentDidMount() {
        window.addEventListener("monitorsUpdated", this.recievedMonitors)
        window.ipc.send("request-monitors")
        window.reactReady = true
    }

    recievedMonitors = (e) => {
        this.setState({ monitors: e.detail })
    }

    monitorNameChange = (e) => {
        const id = e.currentTarget.dataset.id
        const newNames = { ...this.state.names, [id]: e.currentTarget.value }
        this.setState({ names: newNames })
        window.ipc.send('save-settings', { names: newNames })
    }

    getRenameMonitors = () => {
        const monitorsList = Object.values(this.state.monitors)
        if (monitorsList.length === 0) {
            return (<div className="no-displays-message">No compatible displays found.</div>)
        }
        return monitorsList.map((monitor) => {
            if (monitor.type === "none") return null
            return (
                <SettingsChild key={monitor.id} title={monitor.name} input={(
                    <input 
                        type="text" 
                        placeholder="Enter monitor name..." 
                        data-id={monitor.id} 
                        onChange={this.monitorNameChange} 
                        value={this.state.names[monitor.id] || ""}
                    />
                )} />
            )
        })
    }

    render() {
        return (
            <SafeRender>
                <div id="settings-window" className="window-boundary">
                    <Titlebar title="Settings" />
                    <div className="main">
                        <div className="settings-page-content">
                            <div className="pageSection">
                                <div className="sectionTitle">Rename Monitors</div>
                                {this.getRenameMonitors()}
                                <p style={{marginTop: "20px"}}>
                                    <a className="button" onClick={() => window.ipc.send('request-monitors')}>Refresh Monitors</a>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </SafeRender>
        )
    }
}

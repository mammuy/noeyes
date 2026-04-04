import React, { PureComponent } from "react";
import AppLogo from "../assets/logo.png"
import IntroVideo from "../assets/intro-video.mp4"

export default class IntroWindow extends PureComponent {

    constructor(props) {
        super(props)
    }

    render() {
        return (
            <div className="page">
                <img src={AppLogo} />
                <div className="intro-title">Hello, Curtin!</div>
                <p>The tray icon for Curtin is probably hidden, so you should move it to some place you can easily access it. See below for instructions.</p>
                <video id="video" width="400" height="300" preload={true} loop={true}><source src={IntroVideo} type="video/mp4" /></video>
                <a className="button" onClick={window.closeIntro}>Close</a>
            </div>
        );
    }
}

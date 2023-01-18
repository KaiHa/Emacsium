/**
 * Copyright 2023: Kai Harries <kai.harries@posteo.de>
 * SPDX-License-Identifier: MIT
 *
 * The background sript is responsible for:
 *  - turning on/off Emacsium for single tabs
 *  - updating the Emacsium button to reflect the Emacsium state
 *    (on/off/disabled)
 *  - opening new tabs on behalf of the content-script
 *  - storing data to the clipboard on behalf of the content-script
 */

"use strict";

/**
 * Add handler for commands (keyboard shortcuts).
 */
browser.commands.onCommand.addListener(command => {
    console.debug(`received command: ${command}`);
    switch (command) {
    case "emium-on":
        browser.tabs.query({active: true, currentWindow: true})
            .then(tabs => setOn(tabs[0].id, true))
            .catch(logError);
        break;
    case "emium-off":
        browser.tabs.query({active: true, currentWindow: true})
            .then(tabs => setOn(tabs[0].id, false))
            .catch(logError);
        break;
    }
});

/**
 * Add handler for messages from the content-script.
 */
browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
    console.debug(`received message "${req.content}" from tab ${sender.tab.id}`);
    switch (req.content) {
    case "isOn?":
        const tid = `tabId:${sender.tab.id}`;
        browser.storage.local.get(tid)
            .then(res => sendResponse({isOn: res[tid]}))
            .catch(err => console.error(`Error: ${err}`));
        return true;  // We will call sendResponse asynchronously
    case "openTab":
        browser.tabs.create({url: req.href});
        return false;
    case "killRingSave":
        navigator.clipboard.writeText(req.text)
            .catch(logError);
        return false;
    default:
        console.warn(`received unexpected message: ${req.content}`);
        return false;
    }
});

/**
 * Add handler for button clicks that toggle the Emacsium on/off
 * state.
 */
browser.action.onClicked.addListener(tab => {
    const tid = `tabId:${tab.id}`;
    browser.storage.local.get(tid)
        .then(res => setOn(tab.id, res[tid] != true))
        .catch(logError);
});

/**
 * Add handler for newly activated tabs to update the button
 * appearance.
 */
browser.tabs.onActivated.addListener(a => updateButtonPresentation(a.tabId));

/**
 * Add handler for "status" changes of web-pages (loading/complete) to
 * update the button appearance.
 */
browser.tabs.onUpdated.addListener((tabId, _1, _2) => updateButtonPresentation(tabId), {properties: ["status"]});

/**
 * Helper function to update button appearance to reflect the Emacsium
 * state (on/off/disabled).
 */
function updateButtonPresentation(tabId) {
    const tid = `tabId:${tabId}`;
    browser.storage.local.get(tid)
        .then(res => updateBtn(res[tid] != false)) /* The default initial state (on/off) is decided here. */
        .catch(_ => updateBtn(true));

    function updateBtn(isOn) {
        browser.tabs.sendMessage(tabId, {message: "alive?"})
            .then(res => {
                browser.action.enable(tabId);
                setOn(tabId, isOn);
            })
            .catch(_ => {
                browser.action.disable(tabId);
                console.debug(`Content script on tab ${tabId} unreachable`);
            });
    }
}

/**
 * Helper function to switch on/off Emacsium for the tab with the
 * given `tabId`.
 */
function setOn(tabId, on) {
    const script = { target: { tabId: tabId }, func: on ? (() => { window.emium.isOn = true; }) : (() => { window.emium.isOn = false; })};
    browser.scripting.executeScript(script)
        .then(_ => { let obj = {};
                     obj[`tabId:${tabId}`] = on;
                     browser.storage.local.set(obj).catch(logError);
                     browser.action.setBadgeText({text: on ? 'On' : 'Off', tabId: tabId});
                     browser.action.setBadgeBackgroundColor({color: on ? '#44ff4499' : '#ff777799', tabId: tabId});
                     console.debug("Turning " + (on ? "on" : "off") + ` Emacsium on tab ${tabId}`); });
}

/**
 * Helper function to log errors to the console.
 */
function logError(err) {
    console.error(`Error: ${err}`);
}

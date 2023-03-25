/**
 * Copyright 2023: Kai Harries <kai.harries@posteo.de>
 * SPDX-License-Identifier: MIT
 *
 * The background sript is responsible for:
 *  - turning on/off Emacsium for domain of the current tab
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
            .then(async tabs => { const urlHash = await hashUrl(tabs[0].url);
                                  setOn(tabs[0].id, urlHash, true); })
            .catch(logError);
        break;
    case "emium-off":
        browser.tabs.query({active: true, currentWindow: true})
               .then(async tabs => { const urlHash = await hashUrl(tabs[0].url);
                                     setOn(tabs[0].id, urlHash, false); })
            .catch(logError);
        break;
    }
});

/**
 * Add handler for messages from the content-script.
 */
browser.runtime.onMessage.addListener(async (req, sender, sendResponse) => {
    console.debug(`received message "${req.content}" from tab ${sender.tab.id}`);
    switch (req.content) {
    case "isOn?":
        const urlHash = await hashUrl(sender.tab.url);
        browser.storage.local.get(urlHash)
            .then(emiumOff => sendResponse({isOn: emiumOff[urlHash] != true}))
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
browser.action.onClicked.addListener(async tab => {
    const urlHash = await hashUrl(tab.url);
    browser.storage.local.get(urlHash)
        .then(emiumOff => setOn(tab.id, urlHash, emiumOff[urlHash] == true))
        .catch(logError);
});

/**
 * Add handler for newly activated tabs to update the button
 * appearance.
 */
browser.tabs.onActivated.addListener(info => browser.tabs.get(info.tabId).then(tab => updateButtonPresentation(tab)));

/**
 * Add handler for "status" changes of web-pages (loading/complete) to
 * update the button appearance.
 */
browser.tabs.onUpdated.addListener((_1, _2, tab) => updateButtonPresentation(tab), {properties: ["status"]});

/**
 * Helper function to update button appearance to reflect the Emacsium
 * state (on/off/disabled).
 */
async function updateButtonPresentation(tab) {
    const urlHash = await hashUrl(tab.url);
    browser.storage.local.get(urlHash)
        .then(emiumOff => updateBtn(emiumOff[urlHash] != true))
        .catch(_ => updateBtn(true));

    function updateBtn(isOn) {
        browser.tabs.sendMessage(tab.id, {message: "alive?"})
            .then(res => {
                browser.action.enable(tab.id);
                setOn(tab.id, urlHash, isOn);
            })
            .catch(_ => {
                browser.action.disable(tab.id);
                console.debug(`Content script on tab ${tab.id} unreachable`);
            });
    }
}

/**
 * Helper function to switch on/off Emacsium for the tab with the
 * given `tabId` and `urlHash`.
 */
function setOn(tabId, urlHash, on) {
    const script = { target: { tabId: tabId }, func: on ? (() => { window.emium.isOn = true; }) : (() => { window.emium.isOn = false; })};
    browser.scripting.executeScript(script)
        .then(_ => { if (on) {
                         browser.storage.local.remove(urlHash);
                     } else {
                         let obj = {};
                         obj[urlHash] = true;
                         browser.storage.local.set(obj).catch(logError);
                     }
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


/**
 * Return hash of the given `url` (only the domain part).
 */
async function hashUrl(url) {
    const str = /^https?:\/\/(.+?)(\/|$|\?)/.exec(url)[1];
    const buf = await crypto.subtle.digest("SHA-256",
                                           new TextEncoder().encode(str));
    const hash = Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `urlHash:${hash}`;
}

/**
 * Copyright 2023: Kai Harries <kai.harries@posteo.de>
 * SPDX-License-Identifier: MIT
 *
 * Emacsium has different states.  Each state has its own key event
 * handler.  The states and their handler are:
 *  - standard (standardHandler)
 *  - ignoreNextKey (ignoreNextKeyHandler)
 *  - help (helpHandler)
 *  - follow (followHandler)
 */

"use strict";

function emiumInit() {
    if (window.hasRun) {
        return;
    }
    window.hasRun = true;

    window.emium = {};
    /* The handler will reflect the current state of Emacsium, the
     * initial state is "standard". */
    window.emium.handler = standardHandler;
    /* The default state of Emacsium (on/off) is set in background.js,
     * editing the below line is futile. */
    window.emium.isOn = false;

    browser.runtime.sendMessage({content: "isOn?"})
        .then(res => window.emium.isOn = res.isOn)
        .catch(err => console.error(`Failed to request stored state: ${err}`));

    /* All key events will be handled by this listener. */
    window.addEventListener('keydown', (event) => {
        if (window.emium.isOn && window.emium.handler(event)) {
            event.stopPropagation();
            event.preventDefault();
        }
    }, true);

    /* Handler for requests by the background script. */
    browser.runtime.onMessage.addListener((req, sender, sendResponse) => {
        console.debug(`received message "${req.message}"`);
        if (req.message === "alive?") {
            sendResponse({alive: true});
        }
    });
    console.debug('Emacsium initialized');
}

emiumInit();

/**
 * Transition to the "follow" state.  Show shortcuts for all links or
 * other "clickable" elements in the document.
 */
function transition2FollowState(newTab) {
    const lhint = hintStringIterator(0);

    /* Find anchors (<a>) */
    for (const e of document.getElementsByTagName("a")) {
        if (newTab) {
            _createHint(e, () => {
                browser.runtime.sendMessage({content: "openTab", href: e.href})
                    .catch(err => console.error(`Failed to open link in tab: ${err}`));
            });
        } else {
            _createHint(e, () => window.location = e.href);
        }
    }

    /* Find buttons (<button>) */
    for (const e of document.getElementsByTagName("button")) {
        _createHint(e, () => e.click());
    }

    /* Find summaries (<summary>) */
    for (const e of document.getElementsByTagName("summary")) {
        _createHint(e, () => e.click());
    }

    /* Find input fields (<input>) */
    for (const e of document.getElementsByTagName("input")) {
        _createHint(e, () => e.focus());
    }

    window.emium.handler = followHandler;

    /**
     * Create a link hint and place it in the document.  Will return
     * `null` if no link hint was created.
     */
    function _createHint(e, followFunction) {
        if ( _isNotVisible(e)) {
            return null;
        }
        const hint = lhint.next().value;
        if (hint == undefined) {  /* Hint shortcuts are depleted */
            return null;
        }

        let div = document.createElement('div');
        div.setAttribute("id", "emiumhint_" + hint);
        div.setAttribute("class", "emium-overlay__hint");
        let p = document.createElement('p');
        const ak = e.accessKeyLabel || e.accessKey;
        if (ak !== "") {
            p.append(`[${ak}] `);
        }
        let b = document.createElement('b');
        b.append(hint);
        p.append(b);
        div.append(p);
        const ebounds = e.getBoundingClientRect();
        const marginLeft = parseInt(document.defaultView.getComputedStyle(document.body).getPropertyValue('margin-left'));
        const marginTop = parseInt(document.defaultView.getComputedStyle(document.body).getPropertyValue('margin-top'));
        const left = window.visualViewport.pageLeft - marginLeft + ebounds.left;
        const top = window.visualViewport.pageTop - marginTop + ebounds.top;
        div.setAttribute("style", `left: ${left}px; top: ${top}px`);
        document.body.prepend(div);
        div.emiumFollowFunction = followFunction;
        return div;
    }

    /**
     * Returns `true` if the given element is not visible for various
     * reasons like:
     *  - invisible
     *  - outside of viewport
     *  - collapsed
     *  - covered by some other element
     */
    function _isNotVisible(e) {
        if (window.getComputedStyle(e) === 'none') {  /* Invisible element */
            return true;
        }
        const bcr = e.getBoundingClientRect();
        switch (true) {
        case bcr.bottom < 0:  /* above the viewport */
            return true;
        case bcr.top > window.visualViewport.height:  /* below the viewport */
            return true;
        case bcr.width == 0 || bcr.height == 0:  /* hidden/collapsed */
            return true;
        default:
            /* Checking for the case where some element x is covering e */
            const x = document.elementFromPoint((bcr.left + bcr.right) / 2, (bcr.top + bcr.bottom) / 2);
            if (x == null) {
                return false;
            }
            const eZ = document.defaultView.getComputedStyle(e).getPropertyValue('z-index');
            const xZ =  document.defaultView.getComputedStyle(x).getPropertyValue('z-index');
            if (xZ === 'auto') {
                return false;
            } else if (eZ === 'auto') {
                return true; /* x has a z-index != 'auto', we assume that e is covered by x. */
            } else {
                console.debug(`x = ${xZ}, e = ${eZ}`);
                return x != e && xZ > eZ; /* e is covered by x. */
            }
        }
    }
}

/**
 * Transition from the "follow" state to the "standard" state
 */
function transitionFollow2Standard() {
    const arr = [];
    for (const e of document.getElementsByClassName('emium-overlay__hint')) {
        arr.push(e);
    }
    for (const e of arr) {
        e.remove();
    }
    window.emium.handler = standardHandler;
}

/**
 * Transition to the state "help".
 */
function transition2Help() {
    let div = document.createElement("div");
    div.setAttribute("id", "emium-overlay__help");
    let tbl = document.createElement("table");
    tbl.setAttribute("class", "emium-table");
    /* Table header */
    let thead = tbl.createTHead();
    let tr = document.createElement("tr");
    let th = document.createElement("th");
    let firefoxHelp = document.createElement('a');
    firefoxHelp.append('Show help for Firefox standard key-bindings');
    firefoxHelp.setAttribute('href', 'https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly');
    th.setAttribute("class", "emium-th");
    th.setAttribute("colspan", "2");
    th.append("Emacsium key bindings");
    tr.append(th);
    thead.append(tr);
    tbl.append(thead);
    /* Table body */
    let tbody = tbl.createTBody();
    for (const [key, desc] of [ ["C-.", "Turn off Emacsium for the current tab (default binding)"],
                                ["C-,", "Turn on Emacsium for the current tab (default binding)"],
                                ["C-;", "Ignore next key"],
                                ["C-?", firefoxHelp],
                                ["?", "Show Emacsium key-bindings"],
                                ["f", "Show shortcuts for the links in the document"],
                                ["F", "Show shortcuts for the links in the document (links are opened in a new tab)"],
                                ["l", "Back in history"],
                                ["r", "Forward in history"],
                                ["w", "Copy current URL as org-link to the clipboard"],
                                ["n", "Scroll down by one line"],
                                ["p", "Scroll up by one line"],
                                ["<space>", "Scroll down by one page (Firefox default)"],
                                ["<backspace>", "Scroll up by one page"],
                                ["M->", "Scroll to the end of the document"],
                                ["M-<", "Scroll to the start of the document"],
                                ["F7", "Toggle caret browsing (Firefox default)"]]) {
        let tr = document.createElement("tr");
        let td = document.createElement("td");
        let code = document.createElement("code");
        code.append(key);
        td.setAttribute("class", "emium-td");
        td.append(code);
        tr.append(td);
        td = document.createElement("td");
        td.setAttribute("class", "emium-td");
        td.append(desc);
        tr.append(td);
        tbody.append(tr);
    }
    tbl.append(tbody);
    div.append(tbl);
    document.body.append(div);
    window.emium.handler = helpHandler(() => div.remove());
}

/**
 * Handler that is active in state "standard".
 */
function standardHandler(keyEvent) {
    /* Do nothing if in an input element has the focus */
    if (document.activeElement.tagName == 'INPUT') {
        return false;
    }

    switch (true) {
    case keyEvent.key === ';':
        window.emium.handler = ignoreNextKeyHandler;
        return true;
    case keyEvent.altKey && keyEvent.key === '<':
        window.scrollTo(0, 0);
        return true;
    case keyEvent.altKey && keyEvent.key === '>':
        window.scrollTo(0, document.body.scrollHeight);
        return true;
    case keyEvent.ctrlKey && keyEvent.key === '?':
        browser.runtime.sendMessage({content: "openTab", href: 'https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly'})
            .catch(err => console.error(`Failed to open link in tab: ${err}`));
        return true;
    case keyEvent.ctrlKey || keyEvent.key === 'Control'
            || keyEvent.altKey || keyEvent.key === 'Alt'
            || keyEvent.key === 'Shift':
        break;
    /* No key-bindings with control or alt key below this point! */
    case keyEvent.key === 'w':
        const str = `[[${window.location}][${document.title}]]`;
        browser.runtime.sendMessage({content: "killRingSave", text: str})
            .catch(err => console.error(`Failed to copy url to clipboard: ${err}`));
        return true;
    case keyEvent.key === 'n':
        window.scrollByLines(1);
        return true;
    case keyEvent.key === 'p':
        window.scrollByLines(-1);
        return true;
    case keyEvent.key === '?':
        transition2Help();
        return true;
    case keyEvent.key === 'Backspace':
        window.scrollByPages(-1);
        return true;
    case keyEvent.key === 'f':
        transition2FollowState(false);
        return true;
    case keyEvent.key === 'F':
        transition2FollowState(true);
        return true;
    case keyEvent.key === 'l':
        window.history.back();
        return true;
    case keyEvent.key === 'r':
        window.history.forward();
        return true;
    }
    return false;
}

/**
 * Handler that is active in state "ignoreNextKey".  Will never handle
 * any key event and therefore always return false.
 */
function ignoreNextKeyHandler(keyEvent) {
    /* Transition back to state "standard" */
    window.emium.handler = standardHandler;
    return false;
}

/**
 * Returns an handler that is active in state "help".
 */
function helpHandler(closeFunc) {
    /* The returned handler function ignores the keyEvent and will
     * call the given closeFunc and transition to state "standard"
     * whenever called. */
    return ((_keyEvent) => {
        closeFunc();
        window.emium.handler = standardHandler;
        return true;
    });
}

/**
 * Handler that is active in state "follow".  Returns true if the
 * keyEvent was handled.
 */
function followHandler(keyEvent) {
// TODO Links on the button of this page are not hinted [[https://www.jenkins.io/][Jenkins]]
    switch (true) {
    case keyEvent.key === 'Escape':
        transitionFollow2Standard();
        return true;
    case keyEvent.key && keyEvent.altKey && keyEvent.shiftKey:  /* access key */
        transitionFollow2Standard();
        return false;
    case keyEvent.key === 'Control' || keyEvent.key === 'Alt' || keyEvent.key === 'Shift' || keyEvent.key === 'Meta':
        return false;
    case keyEvent.key && (keyEvent.ctrlKey || keyEvent.altKey || keyEvent.shiftKey):
        return false;
    /* No key-bindings with control or alt key below this point! */
    default:
        /* Transition to the second step of the "follow" state. */
        window.emium.handler = (keyEvent2 => {
            if (followLinkHint(keyEvent.key + keyEvent2.key)) {
                /* Link was followed, transition to "standard" state. */
                transitionFollow2Standard();
            } else {
                /* Link was not followed, back to the first step of
                 * the "follow" state. */
                window.emium.handler = followHandler;
            }
            return true;
        });
    }
    return false;
}

/**
 * Helper function that returns unique strings for usage as link
 * hints.
 */
function* hintStringIterator(idx) {
    const ks = ['a', 's', 'd', 'f', 'j', 'k', 'l',  'g', 'h', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'z', 'x', 'c', 'v', 'b', 'n', 'm'];
    const kks = ks.flatMap(x => ks.map(y => x + y));
    while (idx < kks.length) {
        yield kks[idx];
        idx++;
    }
}

/**
 * Helper function to follow the link hint `chars`.  Returning `false`
 * if no such link hint was found.
 */
function followLinkHint(chars) {
    const div = document.getElementById('emiumhint_' + chars);
    if (div != null) {
        div.emiumFollowFunction();
        transitionFollow2Standard();
        return true;
    } else {
        /* Flash the window red */
        let div = document.createElement("div");
        div.setAttribute("id", "emium-overlay__err");
        document.body.append(div);
        setTimeout(() => div.remove(), 400);
        return false;
    }
}

// Flatten UMD wrappers: the xterm bundles register themselves as
// window.<Name> = { <Name>: class }, matching their CJS export shape.
// Rebind the class itself so call sites can use `new FitAddon()` etc.
(function () {
    ["Terminal", "AttachAddon", "FitAddon", "SearchAddon", "WebLinksAddon", "WebglAddon"].forEach(n => {
        const v = window[n];
        if (v && typeof v === "object" && v[n]) window[n] = v[n];
    });
})();

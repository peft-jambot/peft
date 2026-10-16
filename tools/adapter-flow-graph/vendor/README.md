# Vendored dependency

`cytoscape.min.js` — [Cytoscape.js](https://js.cytoscape.js.org/) **3.30.2**, MIT
licensed. Fetched verbatim from:

    https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js

It is vendored rather than loaded from a CDN so that `index.html` works with no
network at all: over `file://`, from a local web server, and inside a static
Hugging Face Space. The upstream MIT license header is retained at the top of
the file.

To upgrade, download the new build and re-check that the page loads with a clean
browser console:

    curl -sS -o vendor/cytoscape.min.js \
        https://unpkg.com/cytoscape@<version>/dist/cytoscape.min.js

# Starts the dev server from a clean build folder. After a production build (`next build`) the leftovers in .next make the dev server rebuild and reload pages
# in a loop (hundreds of times a minute), which breaks every browser test and any client script. Deleting .next first costs one cold compile and is always safe:
# it holds only generated files.
fresh_next() { rm -rf .next; }

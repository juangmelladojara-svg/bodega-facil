process.chdir(__dirname);
process.argv = [process.argv[0], "next", "dev"];
require("./node_modules/next/dist/bin/next");

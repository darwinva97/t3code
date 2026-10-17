import { installBasePathScope } from "./basePath";
import { showBootError } from "./lib/bootError";

// Before any module reads browser storage (see basePath.ts).
installBasePathScope();

// Bundled dev can move UI code into shared chunks. Load it only after this
// entry runs the React refresh preamble, and catch failures before React mounts.
void import("./main").then(({ startup }) => startup).catch(showBootError);

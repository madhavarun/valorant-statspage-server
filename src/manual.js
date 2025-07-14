import { removeMatch } from "./matchManager.js";

async function manageMatches() {
    await removeMatch('3657094b-da93-414f-8ba6-d15af56b9936', 's1');
    await removeMatch('548fdf73-1759-4230-b4cb-e02a9766fc2c', 's1');
    await removeMatch('5703c163-78d1-402c-b28c-44d93a52050f', 's1')
}

manageMatches();
const DATA = JSON.parse(document.getElementById("fixture").textContent);
const META = DATA.meta, NBS = DATA.notebooks, NOTES = DATA.notes;
const byId = Object.fromEntries(NOTES.map((n) => [n._id, n]));
const nbById = Object.fromEntries(NBS.map((b) => [b._id, b]));
const ORIGINAL = JSON.stringify(NOTES);

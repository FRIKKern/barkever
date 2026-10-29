if (location.hash.length > 1) fromHash(); else { applyState(1, false); history.replaceState(null, "", toHash()); }
render();

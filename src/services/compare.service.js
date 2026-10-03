function compareItems(items) {
  if (!Array.isArray(items) || items.length < 2 || items.length > 10) {
    throw new Error("Provide between 2 and 10 items to compare");
  }

  const columns = new Set(["name"]);
  const rows = items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`Item ${index + 1} must be an object`);
    }
    if (
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 120
    ) {
      throw new Error(
        `Item ${index + 1} must have a name of at most 120 characters`,
      );
    }
    const row = { name: item.name.trim() };
    for (const [key, value] of Object.entries(item)) {
      if (key === "name") continue;
      if (
        !/^[\w -]{1,40}$/.test(key) ||
        ["__proto__", "constructor", "prototype"].includes(key)
      ) {
        throw new Error(
          "Comparison fields must use simple names up to 40 characters",
        );
      }
      if (
        !["string", "number", "boolean"].includes(typeof value) ||
        (typeof value === "number" && !Number.isFinite(value))
      ) {
        throw new Error(
          `Comparison value for ${key} must be text, numeric, or boolean`,
        );
      }
      columns.add(key);
      row[key] = value;
    }
    return row;
  });

  if (columns.size > 13)
    throw new Error("Compare up to 12 attributes per request");
  return { columns: [...columns], rows };
}

module.exports = { compareItems };

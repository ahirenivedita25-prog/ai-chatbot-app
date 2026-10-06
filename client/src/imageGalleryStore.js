const databaseName = "moonlit-local-gallery";
const storeName = "images";
const maxImagesPerUser = 60;

function openGalleryDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("Image gallery storage is unavailable in this browser"));
      return;
    }
    const request = window.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: "id" });
        store.createIndex("userId", "userId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listGeneratedImages(userId) {
  const database = await openGalleryDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readonly");
      const request = transaction
        .objectStore(storeName)
        .index("userId")
        .getAll(IDBKeyRange.only(userId));
      request.onsuccess = () =>
        resolve(
          request.result.sort(
            (first, second) => second.createdAt - first.createdAt,
          ),
        );
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function saveGeneratedImage(userId, image) {
  const database = await openGalleryDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.index("userId").getAll(IDBKeyRange.only(userId));
      request.onsuccess = () => {
        const existing = request.result.sort(
          (first, second) => second.createdAt - first.createdAt,
        );
        for (const record of existing.slice(maxImagesPerUser - 1)) {
          store.delete(record.id);
        }
        store.put({ ...image, userId, createdAt: Date.now() });
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

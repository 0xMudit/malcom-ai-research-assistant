const urls =
  process.argv.slice(2).length > 0
    ? process.argv.slice(2)
    : ["http://65.0.71.41:3000", "https://malcomman.duckdns.org"];

async function readText(response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function collectStaticAssets(html) {
  const assetPattern =
    /\/_next\/static\/[^"'`<>\s\\)]+?\.(?:css|js|avif|gif|ico|jpg|jpeg|png|svg|webp|woff2?)/g;

  return [...new Set(Array.from(html.matchAll(assetPattern), (match) => match[0]))];
}

async function fetchCheckedWithRetry(url, options, validate, attempts = 30) {
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      const text = await readText(response);
      const validationError = validate(response, text);

      if (!validationError) {
        return { response, text };
      }

      lastError = new Error(validationError);

      if (![502, 503, 504].includes(response.status)) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(Math.min(750 * attempt, 3000));
  }

  throw lastError;
}

async function checkUrl(baseUrl) {
  const base = baseUrl.replace(/\/$/, "");
  const { response: home, text: homeText } = await fetchCheckedWithRetry(
    `${base}/`,
    { cache: "no-store" },
    (response, text) => {
      if (!response.ok) {
        return `${base}/ returned HTTP ${response.status}`;
      }

      if (!/text\/html/i.test(response.headers.get("content-type") || "")) {
        return `${base}/ did not return HTML`;
      }

      if (!text.includes("Malcom")) {
        return `${base}/ did not include app markup`;
      }

      if (
        base === "https://malcomman.duckdns.org" &&
        !/no-store/i.test(response.headers.get("cache-control") || "")
      ) {
        return `${base}/ did not return no-store HTML cache headers`;
      }

      return "";
    },
  );

  const assets = collectStaticAssets(homeText);

  assert(assets.length > 0, `${base}/ did not include Next static assets`);

  for (const asset of assets) {
    await fetchCheckedWithRetry(
      `${base}${asset}`,
      { cache: "no-store" },
      (response) => {
        const contentType = response.headers.get("content-type") || "";

        if (!response.ok) {
          return `${base}${asset} returned HTTP ${response.status}`;
        }

        if (
          asset.endsWith(".js") &&
          !/(?:application|text)\/javascript/i.test(contentType)
        ) {
          return `${base}${asset} returned non-JavaScript content type: ${contentType}`;
        }

        if (asset.endsWith(".css") && !/text\/css/i.test(contentType)) {
          return `${base}${asset} returned non-CSS content type: ${contentType}`;
        }

        return "";
      },
      10,
    );
  }

  const { response: chat } = await fetchCheckedWithRetry(
    `${base}/api/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
    (response, text) => {
      if (response.status !== 400) {
        return `${base}/api/chat returned HTTP ${response.status}`;
      }

      if (!/application\/json/i.test(response.headers.get("content-type") || "")) {
        return `${base}/api/chat did not return JSON`;
      }

      if (!text.includes("Message is empty.")) {
        return `${base}/api/chat returned unexpected body`;
      }

      return "";
    },
  );

  const { response: health } = await fetchCheckedWithRetry(
    `${base}/api/health`,
    {
      cache: "no-store",
    },
    (response, text) => {
      if (!response.ok && response.status !== 503) {
        return `${base}/api/health returned HTTP ${response.status}`;
      }

      if (!/application\/json/i.test(response.headers.get("content-type") || "")) {
        return `${base}/api/health did not return JSON`;
      }

      if (!text.includes('"checkedAt"')) {
        return `${base}/api/health returned unexpected body`;
      }

      return "";
    },
  );

  return {
    base,
    home: home.status,
    chat: chat.status,
    health: health.status,
    assets: assets.length,
  };
}

const results = [];

for (const url of urls) {
  results.push(await checkUrl(url));
}

console.table(results);

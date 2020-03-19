const axios = require("axios");
const rateLimit = require("axios-rate-limit");
const fs = require("fs");
const toMarkdown = require("to-markdown");

const fetch = rateLimit(axios.create(), {
  maxRequests: 1,
  perMilliseconds: 5000 // 1500 per hour = 1 per 2400ms
});
fetch.defaults.headers.common["Authorization"] = `Bearer ${process.argv[2]}`;

const logErr = err => {
  console.error(err);
  process.exitCode = 1;
  return;
};

// fetchPrivateFolder :: (number) => Promise<*>
const fetchPrivateFolder = async id => {
  const data = await fetch.get(`https://platform.quip.com/1/folders/${id}`);
  return data;
};

// fetchDocs :: (Array<number>, string) => Promise<*>
const fetchDocs = async (children, folderName = "output") => {
  try {
    if (!fs.existsSync(folderName)) {
      fs.mkdir(folderName, 0o777, err => {
        if (err)
          return logErr(`❌ Failed to create folder ${folderName}. ${err}`);
        console.log(`🗂 ${folderName} created successfully`);
      });
    }

    const ids = children
      .filter(thread => !!thread.thread_id && !(`restricted` in thread))
      .map(({ thread_id }) => thread_id)
      .join(",");

    const folderIds = children
      .filter(folder => !!folder.folder_id && !(`restricted` in folder))
      .map(({ folder_id }) => folder_id);

    if (folderIds.length > 0) {
      await folderIds.forEach(async folderId => {
        await fetchThreads(folderId, folderName);
      });
    }
    if (ids) {
      const data = await fetch.get(
        `https://platform.quip.com/1/threads/?ids=${ids}`
      );
      await writeFiles(folderName, data);
    }
    return;
  } catch (error) {
    logErr(error);
  }
};

// fetchThreads :: (number, string) => Promise<*>
const fetchThreads = async (folderId, parentDir) => {
  try {
    const { data } = await fetch.get(
      `https://platform.quip.com/1/folders/${folderId}`
    );

    if (!data.folder.title) return;
    await fetchDocs(
      data.children,
      `${parentDir}/${data.folder.title.replace(/\//g, "-")}`
    );

    return;
  } catch (error) {
    logErr(error);
  }
};

// writeFiles :: Object => void
const writeFiles = (folderName, { data }) => {
  data = Object.values(data);
  data.forEach(async ({ thread, html }) => {
    const file = thread.title.replace(/\//g, "");
    const fileName = `${folderName}/${file}`;

    fs.writeFile(`${fileName}.html`, html, err => {
      if (err) return logErr(`❌ Failed to save ${fileName}.html. ${err}`);

      console.log(`✅ ${fileName}.html saved successfully`);
    });

    fs.writeFile(`${fileName}.md`, toMarkdown(html), err => {
      if (err) return logErr(`❌ Failed to save ${fileName}.md. ${err}`);

      console.log(`✅ ${fileName}.md saved successfully`);
    });

    /**
     * This creates files based on type.
     *
     * Currently, something in the Versett folder is causing this to fail.
     */
    let fileType = "pdf";
    switch (thread.type) {
      case "document":
        fileType = "docx";
        break;
      case "spreadsheet":
        fileType = "xlsx";
        break;
    }

    const {
      data: fileStream
    } = await fetch.get(
      `https://platform.quip.com/1/threads/${thread.id}/export/${fileType}`,
      { responseType: "arraybuffer" }
    );
    fs.writeFile(`${fileName}.${fileType}`, fileStream, err => {
      if (err)
        return logErr(`❌ Failed to save ${fileName}.${fileType}. ${err}`);

      console.log(`✅ ${fileName}.${fileType} saved successfully`);
    });
  });
};

// main :: () => void
const main = async () => {
  if (!process.argv[2]) {
    console.log("❌ Please provide your Quip API token. Exiting.");
    process.exitCode = 1;
    return;
  }
  try {
    const startDir = "JKOAOALS106";

    let {
      data: { children }
    } = await fetchPrivateFolder(startDir);
    await fetchDocs(children);
  } catch (error) {
    logErr(error);
  }
};

main();

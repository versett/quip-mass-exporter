const axios = require("axios");
const { curry, forEach } = require("lodash");
const fs = require("fs");
const toMarkdown = require("to-markdown");

const headers = { Authorization: `Bearer ${process.argv[2]}` };
const fetch = (url, opts = {}) =>
  axios(url, Object.assign({}, { headers }, opts));

const logErr = err => {
  console.error(err);
  process.exitCode = 1;
  return;
};

const timeout = ms => {
  console.log(`⏰ Waiting`);
  return new Promise(resolve => setTimeout(resolve, ms));
};

// fetchPrivateFolder :: (number) => Promise<*>
const fetchPrivateFolder = async id => {
  await timeout(60000);
  const data = await fetch(`https://platform.quip.com/1/folders/${id}`);
  return data;
};

// fetchDocs :: (Array<number>, string) => Promise<*>
const fetchDocs = async (children, folderName = "output") => {
  try {
    fs.mkdir(folderName, 0o777, err => {
      if (err)
        return logErr(`❌ Failed to create folder ${folderName}. ${err}`);
      console.log(`🗂 ${folderName} created successfully`);
    });

    const ids = children
      .filter(thread => !!thread.thread_id && !(`restricted` in thread))
      .map(({ thread_id }) => thread_id)
      .join(",");

    const folderIds = children
      .filter(folder => !!folder.folder_id && !(`restricted` in folder))
      .map(({ folder_id }) => folder_id);

    if (folderIds.length > 0) {
      await forEach(folderIds, async folderId => {
        await timeout(60000);
        await fetchThreads(folderId, folderName);
      });
    }
    if (ids) {
      await timeout(60000);
      const data = await fetch(
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
    await timeout(60000);
    const { data } = await fetch(
      `https://platform.quip.com/1/folders/${folderId}`
    );

    await forEach(data, async folder => {
      if (!folder.title) return;
      await timeout(60000);
      await fetchDocs(data.children, `${parentDir}/${folder.title}`);
    });

    return;
  } catch (error) {
    logErr(error);
  }
};

// writeFiles :: Object => void
const writeFiles = curry((folderName, { data }) => {
  forEach(data, ({ thread, html }) => {
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
  });
});

// main :: () => void
const main = async () => {
  if (!process.argv[2]) {
    console.log("❌ Please provide your Quip API token. Exiting.");
    process.exitCode = 1;
    return;
  }
  try {
    // await timeout(60000);
    // const userData = await fetch("https://platform.quip.com/1/users/current");
    // if (userData.status !== 200)
    //   throw new Error(`❌ Error: ${userData.statusText}`);
    // const startDir = userData.data.private_folder_id;
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

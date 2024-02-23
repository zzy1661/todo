const child = require("child_process");
const fs = require("fs");

const output = child
  .execSync(`git log --format=%B%H----DELIMITER----`)
  .toString("utf-8");


const commitsArray = output
  .split("----DELIMITER----\n")
  .map(commit => {
    const [message, sha] = commit.split("\n");

    return { sha, message };
  })
  .filter(commit => Boolean(commit.sha));

const currentChangelog = fs.readFileSync("./CHANGELOG.md", "utf-8");
const currentVersion = Number(require("./release_version.json").version);
const newVersion = currentVersion + 1;

// 用version和时间作为release 标记
let newChangelog = `# Version ${newVersion} (${
  new Date().toISOString().split("T")[0]
})\n\n`;

const features = [];
const Bugfixes = [];

// 分别维护features和bugfixes的内容，并将message和commit的链接进行绑定
commitsArray.forEach(commit => {
  if (commit.message.startsWith("feature: ")) {
    features.push(
      `* ${commit.message.replace("feature: ", "")} ([${commit.sha.substring(
        0,
        6
      )}](https://github.com/BaronStack/release_notes/commit/${
        commit.sha
      }))\n`
    );
  }
  if (commit.message.startsWith("chore: ")) {
    Bugfixes.push(
      `* ${commit.message.replace("chore: ", "")} ([${commit.sha.substring(
        0,
        6
      )}](https://github.com/BaronStack/release_notes/commit/${
        commit.sha
      }))\n`
    );
  }
});

if (features.length) {
  newChangelog += `## Features\n`;
  features.forEach(feature => {
    newChangelog += feature;
  });
  newChangelog += '\n';
}

if (Bugfixes.length) {
  newChangelog += `## Bugfixes\n`;
  Bugfixes.forEach(bugfix => {
    newChangelog += bugfix;
  });
  newChangelog += '\n';
}

// prepend the newChangelog to the current one
fs.writeFileSync("./CHANGELOG.md", `${newChangelog}${currentChangelog}`);
// update package.json
fs.writeFileSync("./package.json", JSON.stringify({ version: String(newVersion) }, null, 2));

// create a new commit
child.execSync('git add .');
child.execSync(`git commit -m "chore: Bump to version ${newVersion}"`);

// tag the commit
child.execSync(`git tag -a -m "Tag for version ${newVersion}" version${newVersion}`);

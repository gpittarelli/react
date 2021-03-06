/**
 * Copyright (c) 2013-present, Facebook, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

const {markdown, danger} = require('danger');
const fetch = require('node-fetch');

const {generateResultsArray} = require('./scripts/rollup/stats');
const {readFileSync} = require('fs');

const currentBuildResults = JSON.parse(
  readFileSync('./scripts/rollup/results.json')
);

/**
 * Generates a Markdown table
 * @param {string[]} headers
 * @param {string[][]} body
 */
function generateMDTable(headers, body) {
  const tableHeaders = [
    headers.join(' | '),
    headers.map(() => ' --- ').join(' | '),
  ];

  const tablebody = body.map(r => r.join(' | '));
  return tableHeaders.join('\n') + '\n' + tablebody.join('\n');
}

/**
 * Generates a user-readable string from a percentage change
 * @param {string[]} headers
 */
function addPercent(change, includeEmoji) {
  if (change > 0 && includeEmoji) {
    return `:small_red_triangle:+${change}%`;
  } else if (change > 0) {
    return `+${change}%`;
  } else {
    return `${change}%`;
  }
}

function setBoldness(row, isBold) {
  if (isBold) {
    return row.map(element => `**${element}**`);
  } else {
    return row;
  }
}

// Grab the results.json before we ran CI via the GH API
// const baseMerge = danger.github.pr.base.sha
const parentOfOldestCommit = danger.git.commits[0].parents[0];
const commitURL = sha =>
  `http://react.zpao.com/builds/master/_commits/${sha}/results.json`;

fetch(commitURL(parentOfOldestCommit)).then(async response => {
  const previousBuildResults = await response.json();
  const results = generateResultsArray(
    currentBuildResults,
    previousBuildResults
  );

  const percentToWarrentShowing = 1;
  const packagesToShow = results
    .filter(
      r =>
        Math.abs(r.prevFileSizeChange) > percentToWarrentShowing ||
        Math.abs(r.prevGzipSizeChange) > percentToWarrentShowing
    )
    .map(r => r.packageName);

  if (packagesToShow.length) {
    let allTables = [];

    // Highlight React and React DOM changes inline
    // e.g. react: `react.production.min.js`: -3%, `react.development.js`: +4%

    if (packagesToShow.includes('react')) {
      const reactProd = results.find(
        r => r.bundleType === 'UMD_PROD' && r.packageName === 'react'
      );
      if (
        reactProd.prevFileSizeChange !== 0 ||
        reactProd.prevGzipSizeChange !== 0
      ) {
        const changeSize = addPercent(reactProd.prevFileSizeChange, true);
        const changeGzip = addPercent(reactProd.prevGzipSizeChange, true);
        markdown(`React: size: ${changeSize}, gzip: ${changeGzip}`);
      }
    }

    if (packagesToShow.includes('react-dom')) {
      const reactDOMProd = results.find(
        r => r.bundleType === 'UMD_PROD' && r.packageName === 'react-dom'
      );
      if (
        reactDOMProd.prevFileSizeChange !== 0 ||
        reactDOMProd.prevGzipSizeChange !== 0
      ) {
        const changeSize = addPercent(reactDOMProd.prevFileSizeChange, true);
        const changeGzip = addPercent(reactDOMProd.prevGzipSizeChange, true);
        markdown(`ReactDOM: size: ${changeSize}, gzip: ${changeGzip}`);
      }
    }

    // Show a hidden summary table for all diffs

    // eslint-disable-next-line no-var,no-for-of-loops/no-for-of-loops
    for (var name of new Set(packagesToShow)) {
      const thisBundleResults = results.filter(r => r.packageName === name);
      const changedFiles = thisBundleResults.filter(
        r => r.prevFileSizeChange !== 0 || r.prevGzipSizeChange !== 0
      );

      const mdHeaders = [
        'File',
        'Filesize Diff',
        'Gzip Diff',
        'Prev Size',
        'Current Size',
        'Prev Gzip',
        'Current Gzip',
        'ENV',
      ];

      const mdRows = changedFiles.map(r => {
        const isProd = r.bundleType.includes('PROD');
        return setBoldness(
          [
            r.filename,
            addPercent(r.prevFileSizeChange, isProd),
            addPercent(r.prevGzipSizeChange, isProd),
            r.prevSize,
            r.prevFileSize,
            r.prevGzip,
            r.prevGzipSize,
            r.bundleType,
          ],
          isProd
        );
      });

      allTables.push(`\n## ${name}`);
      allTables.push(generateMDTable(mdHeaders, mdRows));
    }

    const summary = `
<details>
<summary>Details of bundled changes.</summary>

<p>Comparing: ${parentOfOldestCommit}...${danger.github.pr.head.sha}</p>


${allTables.join('\n')}

</details>
`;
    markdown(summary);
  }
});

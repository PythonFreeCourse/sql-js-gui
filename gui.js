const execBtn = document.getElementById("execute");
const outputElm = document.getElementById('output');
const errorElm = document.getElementById('error');
const commandsElm = document.getElementById('commands');
const dbFileElm = document.getElementById('dbfile');
const savedbElm = document.getElementById('savedb');
const querySection = document.getElementById('query');
const uploadSection = document.getElementById('dropzone');
const promptArea = document.getElementById('prompt-area');
const artificialLimit = 5000;

// Start the worker in which sql.js will run
const worker = new Worker("worker.sql-wasm.js");
worker.onerror = error;

// Open a database
worker.postMessage({ action: 'open' });

// Connect to the HTML element we 'print' to
function print(text) {
  outputElm.innerHTML = text.replace(/\n/g, '<br>');
}

function error(e) {
  console.log(e);
  errorElm.classList.remove('visually-hidden');
  errorElm.classList.add('alert', 'alert-danger');
  errorElm.textContent = e.message;
}

function noerror() {
  errorElm.classList.add('visually-hidden');
  errorElm.classList.remove('alert', 'alert-danger');
}

function showResults(results, maxRows) {
  tic();
  outputElm.innerHTML = "";
  for (let i = 0; i < results.length; i++) {
    let table = tableCreate(results[i].columns, results[i].values, maxRows);
    outputElm.appendChild(table);
  }
  toc("Displaying results");
}

function askUserIfToShowEverything(results) {
  promptArea.classList.remove('visually-hidden');
  promptArea.innerHTML = `
    <div class="group-question">
      <p>השאילתה מחזירה הרבה תוצאות. להציג את כולן?</p>
      <div class="grouped-buttons">
        <button class="btn btn-success">לא</button>
        <button data-get-all="true" class="btn btn-danger">כן</button>
      </div>
    </div>
  `;
  const buttons = Array.from(promptArea.querySelectorAll('button'))
  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      const getAll = (b.dataset.getAll !== undefined);
      const maxToShow = getAll ? Infinity : artificialLimit;
      if (getAll) {
        promptArea.innerHTML = "<p>זה יקח קצת זמן...</p>";
      }
      showResults(results, maxToShow);
      promptArea.classList.add('visually-hidden');
    });
  });
}

// Run a command in the database
function execute(commands) {
  tic();
  worker.onmessage = function (event) {
    var results = event.data.results;


    toc("Executing SQL");
    if (!results) {
      error({message: event.data.error});
      return;
    }

    if (results[0].values.length > artificialLimit) {
      askUserIfToShowEverything(results);
    } else {
      showResults(results, Infinity);
    }
  }
  worker.postMessage({ action: 'exec', sql: commands });
  outputElm.textContent = "Fetching results...";
}

// Create an HTML table
var tableCreate = function () {
  function valconcat(vals, tagName) {
    if (vals.length === 0) return '';
    var open = '<' + tagName + '>', close = '</' + tagName + '>';
    return open + vals.join(close + open) + close;
  }
  return function (columns, values, maxRows) {
    maxRows = Math.min(maxRows, values.length);
    values = values.slice(0, maxRows);
    var tbl = document.createElement('table');
    tbl.classList.add('table', 'table-hover')
    var html = '<thead>' + valconcat(columns, 'th') + '</thead>';
    var rows = values.map(function (v) { return valconcat(v, 'td'); });
    html += '<tbody>' + valconcat(rows, 'tr') + '</tbody>';
    tbl.innerHTML = html;
    return tbl;
  }
}();

// Execute the commands when the button is clicked
function execEditorContents() {
  noerror()
  execute(editor.getValue() + ';');
}
execBtn.addEventListener("click", execEditorContents, true);

// Performance measurement functions
var tictime;
if (!window.performance || !performance.now) { window.performance = { now: Date.now } }
function tic() { tictime = performance.now() }
function toc(msg) {
  var dt = performance.now() - tictime;
  console.log((msg || 'toc') + ": " + dt + "ms");
}

// Add syntax highlihjting to the textarea
var editor = CodeMirror.fromTextArea(commandsElm, {
  mode: 'text/x-sql',
  viewportMargin: Infinity,
  autofocus: true,
  indentWithTabs: true,
  smartIndent: true,
  lineNumbers: true,
  matchBrackets: true,
  autofocus: true,
  extraKeys: {
    "Ctrl-Enter": execEditorContents,
    "Ctrl-S": savedb,
  }
});

// Load a db from a file
var dbFile = new FileReader();
var defaultQuery = "SELECT `name`, `sql`\n  FROM `sqlite_master`\n  WHERE type='table';"

dbFile.onload = function () {
  worker.onmessage = function () {
    toc("Loading database from file");
    // Show the schema of the loaded database
    editor.setValue(localStorage.getItem('lastQuery') || defaultQuery);
    execEditorContents();

    uploadSection.classList.add('visually-hidden');
    querySection.classList.remove('visually-hidden');
    noerror();
  };
  tic();
  try {
    worker.postMessage({ action: 'open', buffer: dbFile.result }, [dbFile.result]);
  }
  catch (exception) {
    worker.postMessage({ action: 'open', buffer: dbFile.result });
  }
}


function init() {
  let dropzoneElement = new Dropzone("#demo-upload");


  dropzoneElement.uploadFiles = function(files) {
    var self = this,
        minSteps = 6,
        maxSteps = 60,
        timeBetweenSteps = 1,
        bytesPerStep = 1000000;

    for (var i = 0; i < files.length; i++) {

      var file = files[i];
      totalSteps = Math.round(Math.min(maxSteps, Math.max(minSteps, file.size / bytesPerStep)));

      for (var step = 0; step < totalSteps; step++) {
        var duration = timeBetweenSteps * (step + 1);
        setTimeout(function(file, totalSteps, step) {
          return function() {
            file.upload = {
              progress: 100 * (step + 1) / totalSteps,
              total: file.size,
              bytesSent: (step + 1) * file.size / totalSteps
            };

            self.emit('uploadprogress', file, file.upload.progress, file.upload.bytesSent);
            if (file.upload.progress == 100) {
              file.status = Dropzone.SUCCESS;
              self.emit("success", file, 'success', null);
              self.emit("complete", file);
              self.processQueue();
            }
          };
        }(file, totalSteps, step), duration);
      }
      dbFile.readAsArrayBuffer(files[0]);
    }
  }

  function saveQuery(e) {
    if (e.getValue()) {
      localStorage.setItem('lastQuery', e.getValue());
    }
  }

  editor.setValue(localStorage.getItem('lastQuery') || defaultQuery);
  editor.on("changes", saveQuery);
}

Dropzone.autoDiscover = false;
document.addEventListener("DOMContentLoaded", init);

// Save the db to a file
function savedb() {
  worker.onmessage = function (event) {
    toc("Exporting the database");
    var arraybuff = event.data.buffer;
    var blob = new Blob([arraybuff]);
    var a = document.createElement("a");
    document.body.appendChild(a);
    a.href = window.URL.createObjectURL(blob);
    a.download = "sql.db";
    a.onclick = function () {
      setTimeout(function () {
        window.URL.revokeObjectURL(a.href);
      }, 1500);
    };
    a.click();
  };
  tic();
  worker.postMessage({ action: 'export' });
}

savedbElm.addEventListener("click", savedb, true);

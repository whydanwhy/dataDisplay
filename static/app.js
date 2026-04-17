let editor;

require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@latest/min/vs' }});

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor'), {
        value: "SELECT * FROM logs LIMIT 10;",
        language: "sql",
        theme: "vs-dark"
    });
});

async function runQuery() {
    const query = editor.getValue();

    const response = await fetch('/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });

    const data = await response.json();

    const table = document.getElementById("results");
    table.innerHTML = "";

    if (data.error) {
        table.innerHTML = `<tr><td>${data.error}</td></tr>`;
        return;
    }

    // Header
    let header = "<tr>";
    data.columns.forEach(col => header += `<th>${col}</th>`);
    header += "</tr>";
    table.innerHTML += header;

    // Rows
    data.rows.forEach(row => {
        let rowHtml = "<tr>";
        data.columns.forEach(col => {
            rowHtml += `<td>${row[col]}</td>`;
        });
        rowHtml += "</tr>";
        table.innerHTML += rowHtml;
    });
}
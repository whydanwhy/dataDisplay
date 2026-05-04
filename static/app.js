console.log("app.js loaded");
let editor;
let originalData = [];
let currentColumns = [];
let sortState = { column: null, asc: true };

require.config({ paths: { vs: 'https://unpkg.com/monaco-editor@latest/min/vs' }});

require(['vs/editor/editor.main'], function () {
    editor = monaco.editor.create(document.getElementById('editor'), {
        value: "SELECT * FROM logs LIMIT 10;",
        language: "sql",
        theme: "vs-dark"
    });
});
let echartsInstance = null;

require.config({
    paths: {
        echarts: 'https://cdn.jsdelivr.net/npm/echarts/dist/echarts.min'
    }
});
async function runQuery() {
    let baseQuery = editor.getValue();
    let finalQuery = baseQuery;

const timeRange = document.getElementById("timeRange")?.value;
const startTime = document.getElementById("startTime").value;
const endTime = document.getElementById("endTime").value;

// PRIORITY: Custom range overrides dropdown
if (startTime && endTime) {
    finalQuery = `
        SELECT * FROM (
            ${baseQuery.replace(/;$/, '')}
        ) AS sub
        WHERE timestamp BETWEEN '${startTime.replace("T", " ")}'
        AND '${endTime.replace("T", " ")}'
    `;
} else if (timeRange && timeRange !== "none") {
    const intervalMap = {
        "15m": "INTERVAL '15 minutes'",
        "1h": "INTERVAL '1 hour'",
        "24h": "INTERVAL '24 hours'"
    };

    const interval = intervalMap[timeRange];

    finalQuery = `
        SELECT * FROM (
            ${baseQuery.replace(/;$/, '')}
        ) AS sub
        WHERE timestamp >= NOW() - ${interval}
    `;
}

    console.log("FINAL QUERY:", finalQuery);

    const response = await fetch('/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: finalQuery })
    });

    const data = await response.json();

    if (data.error) {
        alert(data.error);
        return;
    }

    originalData = data.rows;
    currentColumns = data.columns;

    populateFilters(originalData);
    renderTable(originalData);
    loadErrorChart();
}

function populateFilters(data) {
    const levelSet = new Set();
    const serviceSet = new Set();

    data.forEach(row => {
        if (row.level) levelSet.add(row.level);
        if (row.service) serviceSet.add(row.service);
    });

    const levelSelect = document.getElementById("filterLevel");
    const serviceSelect = document.getElementById("filterService");

    levelSelect.innerHTML = '<option value="">All</option>';
    serviceSelect.innerHTML = '<option value="">All</option>';

    levelSet.forEach(val => {
        levelSelect.innerHTML += `<option value="${val}">${val}</option>`;
    });

    serviceSet.forEach(val => {
        serviceSelect.innerHTML += `<option value="${val}">${val}</option>`;
    });
}

function applyFilters() {
    console.log("appplyFilters Called");
    let filtered = [...originalData];

    const level = document.getElementById("filterLevel").value;
    const service = document.getElementById("filterService").value;
    const search = document.getElementById("searchBox").value.toLowerCase();

    if (level) {
        filtered = filtered.filter(row => row.level === level);
    }

    if (service) {
        filtered = filtered.filter(row => row.service === service);
    }

    if (search) {
        filtered = filtered.filter(row =>
            Object.values(row).some(val =>
                String(val).toLowerCase().includes(search)
            )
        );
    }

    if (sortState.column) {
        filtered.sort((a, b) => {
            let valA = a[sortState.column];
            let valB = b[sortState.column];

            if (!isNaN(valA) && !isNaN(valB)) {
                valA = Number(valA);
                valB = Number(valB);
            }

            if (valA < valB) return sortState.asc ? -1 : 1;
            if (valA > valB) return sortState.asc ? 1 : -1;
            return 0;
        });
    }

    renderTable(filtered);
}

function renderTable(data) {
    const table = document.getElementById("results");
    table.innerHTML = "";

    // Header
    let header = "<tr>";
    currentColumns.forEach(col => {
        header += `<th onclick="sortBy('${col}')">${col}</th>`;
    });
    header += "</tr>";
    table.innerHTML += header;

    // Rows
    data.forEach(row => {
        let rowHtml = "<tr>";
        currentColumns.forEach(col => {
            rowHtml += `<td>${row[col]}</td>`;
        });
        rowHtml += "</tr>";
        table.innerHTML += rowHtml;
    });
}

function sortBy(column) {
    if (sortState.column === column) {
        sortState.asc = !sortState.asc;
    } else {
        sortState.column = column;
        sortState.asc = true;
    }

    applyFilters();
}

function clearTimeRange() {
    document.getElementById("startTime").value = "";
    document.getElementById("endTime").value = "";
}

function applyBrushTimeRange(start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);

    const format = (d) => d.toISOString().slice(0, 16);

    document.getElementById("startTime").value = format(startDate);
    document.getElementById("endTime").value = format(endDate);

    console.log("Applied brush range:", startDate, endDate);

    runQuery();
}
// Error chart
let chartInstance = null;

async function loadErrorChart() {
    let baseQuery = `
        SELECT 
            DATE_TRUNC('hour', timestamp) as t,
            level,
            COUNT(*) as count
        FROM logs
        GROUP BY t, level
        ORDER BY t
    `;

    // Apply time filters (reuse logic)
    const startTime = document.getElementById("startTime").value;
    const endTime = document.getElementById("endTime").value;

    if (startTime && endTime) {
        baseQuery = `
            SELECT * FROM (
                ${baseQuery}
            ) sub
            WHERE t BETWEEN '${startTime.replace("T"," ")}'
            AND '${endTime.replace("T"," ")}'
        `;
    }

    const response = await fetch('/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: baseQuery })
    });

    const data = await response.json();
    console.log("CHART DATA:", data);

    if (data.error) {
        console.error(data.error);
        return;
    }

const timeMap = {};
const levels = new Set();

// Build structure
data.rows.forEach(row => {
    const t = row.t;
    const level = row.level;
    const count = Number(row.count);

    levels.add(level);

    if (!timeMap[t]) {
        timeMap[t] = {};
    }

    timeMap[t][level] = count;
});

// Sorted time labels
const labels = Object.keys(timeMap).sort();

// Build series
const series = Array.from(levels).map(level => {
    return {
        name: level,
        type: 'line',
        data: labels.map(t => timeMap[t][level] || 0)
    };
});

    renderChart(labels, series);
}
//Render Chart function
function renderChart(labels, series) {
    require(['echarts'], function (echarts) {
        const chartDom = document.getElementById('errorChart');

        if (!echartsInstance) {
            echartsInstance = echarts.init(chartDom);
        }
        echartsInstance.on('brushEnd', function (params) {
        if (!params.batch.length) return;

    const areas = params.batch[0].areas;
    if (!areas.length) return;

    const coordRange = areas[0].coordRange;

    const startIndex = Math.floor(coordRange[0]);
    const endIndex = Math.ceil(coordRange[1]);

    const startTime = labels[startIndex];
    const endTime = labels[endIndex];

    console.log("Brush selected:", startTime, "to", endTime);

    applyBrushTimeRange(startTime, endTime);
        });

        const option = {
            title: { text: 'Log Levels Over Time' },
            tooltip: { trigger: 'axis' },
            legend: {
                data: series.map(s => s.name)
            },
            xAxis: {
                type: 'category',
                data: labels
            },
            yAxis: {
                type: 'value'
            },
            dataZoom: [
            {
            type: 'inside', // mouse wheel zoom
                xAxisIndex: 0
            },
            {
                type: 'slider', // visible slider
            xAxisIndex: 0
            }
            ],
            brush: {
            toolbox: ['rect', 'clear'],
            xAxisIndex: 0
            },
            series: series
        };

        echartsInstance.setOption(option);
            echartsInstance.on('click', function (params) {
            const clickedTime = params.name;

        console.log("Clicked time:", clickedTime);

        applyTimeFromChart(clickedTime);
});
    });
}

function applyTimeFromChart(timeLabel) {
    // Convert label → Date
    const selectedTime = new Date(timeLabel);

    // Create 1-hour window
    const start = new Date(selectedTime);
    const end = new Date(selectedTime);

    end.setHours(end.getHours() + 1);

    // Format for datetime-local input
    const format = (d) => d.toISOString().slice(0, 16);

    document.getElementById("startTime").value = format(start);
    document.getElementById("endTime").value = format(end);

    console.log("Applied time range:", start, end);

    runQuery();
}
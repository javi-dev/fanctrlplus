// chart-handler.js - Show temp→PWM chart for a fan block
// Uses native <dialog> (no SweetAlert2 dependency)

async function fetchRealtimeData(custom) {
  const res = await fetch(`/plugins/fanctrlplus/include/FanctrlLogic.php?op=read_temp_rpm&custom=${encodeURIComponent(custom)}`);
  if (!res.ok) return { noCache: true };

  const raw = (await res.text()).trim();

  if (!raw || raw === '-' || raw.toUpperCase() === 'N/A') {
    return { noCache: true };
  }

  const [tempPart, rpmStr = ''] = raw.split('|');

  // Star: disk spun down / Idle
  const starMatch = /^\*\s*\((CPU|Disk|Idle)\)/i.exec(tempPart);
  if (starMatch) {
    const origin = starMatch[1];
    const rpm = /^\d+$/.test(rpmStr) ? parseInt(rpmStr, 10) : null;
    if (rpm === null) return { noCache: true };
    return { temp: null, origin, rpm, spunDown: true };
  }

  // Normal numeric temperature
  const numMatch = /(\d+)\s*\((CPU|Disk)\)/i.exec(tempPart);
  if (!numMatch) return { noCache: true };

  const temp   = parseInt(numMatch[1], 10);
  const origin = numMatch[2];
  const rpm    = /^\d+$/.test(rpmStr) ? parseInt(rpmStr, 10) : null;

  return { temp, origin, rpm, spunDown: false };
}

// Helper: show a simple warning dialog
function showWarning(title, message) {
  const dlg = document.createElement('dialog');
  dlg.className = 'fcp-warning-dialog';
  dlg.innerHTML = `
    <div class="fcp-warning-title">${title}</div>
    <p style="margin:0;color:var(--fcp-text-muted);font-size:0.9rem;">${message}</p>
    <div class="fcp-warning-actions">
      <button onclick="this.closest('dialog').close()">OK</button>
    </div>
  `;
  document.body.appendChild(dlg);
  dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
}

window.showFanChart = function (btn) {
  const block = btn.closest('.fan-block');
  if (!block) return;

  const getNum = (selector) => {
    const el = block.querySelector(selector);
    if (!el) return null;
    const val = el.value.replace(/[^\d.]/g, '');
    return val ? parseFloat(val) : null;
  };

  const getSelectVal = (selector) => {
    const el = block.querySelector(selector);
    return el ? el.value : '';
  };

  const custom = block.querySelector('.custom-name-input')?.value || 'Unknown';
  const name = getSelectVal('[name^="custom["]') || '(Unnamed)';
  const pwmMin = getNum('[name^="pwm_percent["]');
  const pwmMax = getNum('[name^="max_percent["]');
  const disksEl = block.querySelector('[name^="disks["], [name^="include[]"]');
  const diskSelected = disksEl && [...disksEl.selectedOptions].some(opt => opt.value);
  const tempLow = getNum('[name^="low["]');
  const tempHigh = getNum('[name^="high["]');
  const cpuEnabled = getSelectVal('[name^="cpu_enable["]') === '1';
  const cpuLow = getNum('[name^="cpu_min_temp["]');
  const cpuHigh = getNum('[name^="cpu_max_temp["]');
  const hasDiskChart = diskSelected && pwmMin !== null && pwmMax !== null;
  const hasCpuChart = cpuEnabled && cpuLow !== null && cpuHigh !== null;

  // Read mid-point values
  const tempMid = getNum('[name^="mid_temp["]');
  const pwmMid = getNum('[name^="mid_pwm_percent["]');

  if ([pwmMin, pwmMax, tempLow, tempHigh].some(v => v === null)) {
    showWarning('⚠️ Missing input', 'Please fill in all Disk Temp and PWM values.');
    return;
  }

  // Interpolation: generate curve data points
  const makeLinePoints = (x1, y1, x2, y2, segments = x2 - x1) => {
    const data = [];
    for (let i = 0; i <= segments; i++) {
      const ratio = i / segments;
      const x = x1 + (x2 - x1) * ratio;
      const y = y1 + (y2 - y1) * ratio;
      data.push({ x, y });
    }
    return data;
  };

  const makePointRadiusArray = (length) => {
    return Array.from({ length }, (_, i) => (i === 0 || i === length - 1) ? 4 : 0);
  };

  const datasets = [];

  if (diskSelected && tempLow !== null && tempHigh !== null) {
    let diskPoints;
    let diskRadius;

    if (tempMid !== null && pwmMid !== null) {
      const seg1 = makeLinePoints(tempLow, pwmMin, tempMid, pwmMid);
      const seg2 = makeLinePoints(tempMid, pwmMid, tempHigh, pwmMax);
      diskPoints = seg1.concat(seg2.slice(1));

      diskRadius = Array.from({ length: diskPoints.length }, (_, i) => {
        if (i === 0 || i === seg1.length - 1 || i === diskPoints.length - 1) return 4;
        return 0;
      });
    } else {
      diskPoints = makeLinePoints(tempLow, pwmMin, tempHigh, pwmMax);
      diskRadius = makePointRadiusArray(diskPoints.length);
    }

    datasets.push({
      label: 'Disk Temp → PWM (%)',
      data: diskPoints,
      borderColor: '#4285f4',
      backgroundColor: 'rgba(66,133,244,0.1)',
      borderWidth: 2,
      pointRadius: diskRadius,
      pointHoverRadius: 6,
      fill: false,
      tension: 0.4,
    });

    if (tempMid !== null && pwmMid !== null) {
      datasets.push({
        label: `Midpoint (${tempMid}°C → ${pwmMid}%)`,
        data: [{ x: tempMid, y: pwmMid }],
        borderColor: '#00bcd4',
        backgroundColor: '#00bcd4',
        pointRadius: 6,
        pointHoverRadius: 8,
        pointStyle: 'circle',
        showLine: false,
        fill: false,
      });
    }
  }

  if (cpuEnabled && cpuLow !== null && cpuHigh !== null) {
    const cpuPoints = makeLinePoints(cpuLow, pwmMin, cpuHigh, pwmMax);
    const cpuRadius = makePointRadiusArray(cpuPoints.length);

    datasets.push({
      label: 'CPU Temp → PWM (%)',
      data: cpuPoints,
      borderColor: '#db4437',
      backgroundColor: 'rgba(219,68,55,0.1)',
      borderWidth: 2,
      pointRadius: cpuRadius,
      pointHoverRadius: 6,
      fill: false,
      tension: 0.4,
    });
  }

  // Footer note
  let footerNote = '';
  if (!cpuEnabled && !diskSelected) {
    footerNote = '⚠️ No rules defined — fan will not be controlled';
  } else if (cpuEnabled && !diskSelected) {
    footerNote = '💡 No disk selected — only CPU rule applies';
  } else if (!cpuEnabled && diskSelected) {
    footerNote = '💡 CPU control is disabled — only Disk rule applies';
  } else {
    footerNote = '💡 CPU and Disk rules are active — Fan PWM = max(Disk, CPU)';
  }

  // --- Create <dialog> ---
  // Remove any existing chart dialog
  document.querySelectorAll('.fcp-chart-dialog').forEach(d => d.remove());

  const dlg = document.createElement('dialog');
  dlg.className = 'fcp-chart-dialog';
  dlg.innerHTML = `
    <div class="fcp-chart-header">
      <h3 class="fcp-chart-title">📈 ${name}</h3>
      <button class="fcp-chart-close" title="Close">&times;</button>
    </div>
    <div class="fcp-chart-body">
      <div id="fan-chart-top">
        <div id="fan-chart-live-note" class="fcp-chart-live-note"></div>
      </div>
      <div id="fan-chart-wrapper" style="position:relative;">
        <canvas id="fan-chart" style="width:100%;height:auto;"></canvas>
        <div class="fcp-chart-footer">${footerNote}</div>
      </div>
    </div>
  `;

  document.body.appendChild(dlg);

  // Close handlers
  dlg.querySelector('.fcp-chart-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close(); // click backdrop
  });

  // Cleanup on close
  dlg.addEventListener('close', () => {
    if (window.__fanChartTimer) clearInterval(window.__fanChartTimer);
    // Destroy chart instance
    const canvas = document.getElementById('fan-chart');
    if (canvas && canvas.__chart) {
      canvas.__chart.destroy();
      canvas.__chart = null;
    }
    dlg.remove();
  });

  dlg.showModal();

  // --- Render chart inside dialog ---
  const customName = custom;
  const snapCpuEnabled = getSelectVal('[name^="cpu_enable["]') === '1';
  const disksElSnap = block.querySelector('[name^="disks["], [name^="include[]"]');
  const snapDiskSelected = !!(disksElSnap && disksElSnap.selectedOptions && disksElSnap.selectedOptions.length > 0);

  const dsCPU  = datasets.find(d => d.label && d.label.includes('CPU'));
  const dsDisk = datasets.find(d => d.label && d.label.includes('Disk'));

  const liveNote = document.getElementById('fan-chart-live-note');
  if (liveNote) {
    liveNote.classList.add('chart-current');
  }

  function pickPercentNearest(ds, t) {
    if (!ds || !ds.data || !ds.data.length || typeof t !== 'number') return null;
    let best = ds.data[0];
    for (const p of ds.data) if (Math.abs(p.x - t) < Math.abs(best.x - t)) best = p;
    return typeof best.y === 'number' ? best.y : null;
  }

  function pickPercentAtMin(ds) {
    if (!ds || !ds.data || !ds.data.length) return null;
    let minPoint = ds.data[0];
    for (const p of ds.data) if (p.x < minPoint.x) minPoint = p;
    return typeof minPoint.y === 'number' ? minPoint.y : null;
  }

  // Draw chart
  setTimeout(() => {
    const canvas  = document.getElementById('fan-chart');
    const wrapper = document.getElementById('fan-chart-wrapper');
    if (!canvas || !wrapper) return;

    if (getComputedStyle(wrapper).position === 'static') {
      wrapper.style.position = 'relative';
    }

    canvas.width  = wrapper.offsetWidth;
    canvas.height = 400;

    const ctx = canvas.getContext('2d');

    const allTemps = datasets
      .flatMap(ds => (ds.data || []).map(p => p.x))
      .filter(x => typeof x === 'number');

    let minTemp, maxTemp;
    if (allTemps.length) {
      minTemp = Math.min(...allTemps);
      maxTemp = Math.max(...allTemps);
    } else {
      minTemp = 0; maxTemp = 100;
    }
    const range = Math.max(1, maxTemp - minTemp);
    const stepSize = range <= 10 ? 1 : range <= 20 ? 2 : 5;

    // Read theme colors from CSS custom properties
    const gridColor = getComputedStyle(document.documentElement).getPropertyValue('--fcp-chart-grid').trim() || 'rgba(0,0,0,0.10)';
    const tickColor = getComputedStyle(document.documentElement).getPropertyValue('--fcp-chart-tick').trim() || 'rgba(0,0,0,0.60)';

    const chart = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: false,
        scales: {
          x: {
            type: 'linear',
            title: { display: true, text: 'Temperature (°C)', color: tickColor },
            min: minTemp - 1,
            max: maxTemp + 1,
            ticks: { stepSize, autoSkip: false, color: tickColor },
            grid:  { color: gridColor },
          },
          y: {
            min: 0,
            max: 100,
            title: { display: true, text: 'Fan Speed (%)', color: tickColor },
            ticks: { stepSize: 10, color: tickColor },
            grid:  { color: gridColor },
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: false, pointStyle: 'line', boxWidth: 30, boxHeight: 0 }
          },
          tooltip: {
            usePointStyle: false,
            pointStyle: 'line',
            boxWidth: 10,
            boxHeight: 0,
            mode: 'nearest',
            intersect: false,
            callbacks: {
              title(items) { return `${items[0].parsed.x}°C`; },
              label(ctx) {
                const label = ctx.dataset.label.includes('Disk') ? 'Disk Temp' : 'CPU Temp';
                const percent = ctx.parsed.y;
                const pwm = Math.round(percent * 2.55);
                return `${label} → Fan Speed = ${percent.toFixed(0)}% (PWM ${pwm})`;
              }
            }
          }
        }
      }
    });

    // Store chart reference for cleanup
    canvas.__chart = chart;

    // Crosshair elements
    const vLine = document.createElement('div');
    const hLine = document.createElement('div');
    const dot   = document.createElement('div');

    Object.assign(vLine.style, {
      position: 'absolute', width: '1.2px',
      display: 'none', pointerEvents: 'none'
    });
    vLine.className = 'chart-vline';

    Object.assign(hLine.style, {
      position: 'absolute', height: '1.2px',
      display: 'none', pointerEvents: 'none'
    });
    hLine.className = 'chart-hline';

    Object.assign(dot.style, {
      position: 'absolute', width: '8px', height: '8px',
      marginLeft: '-4px', marginTop: '-4px',
      borderRadius: '50%', display: 'none', pointerEvents: 'none'
    });
    dot.className = 'chart-dot';

    wrapper.appendChild(vLine);
    wrapper.appendChild(hLine);
    wrapper.appendChild(dot);

    // Live update: current temp + crosshair (every 5s)
    async function updateTopNote() {
      const data = await fetchRealtimeData(customName);
      if (!liveNote) return;

      if (!data || data.noCache) {
        liveNote.innerHTML = `Current: --<br><span style="color:var(--fcp-text-muted);">
          No runtime data yet. If this is a new fan, click <b>Apply</b> to start the loop,
          or wait a few seconds after saving.
        </span>`;
        vLine.style.display = hLine.style.display = dot.style.display = 'none';
        return;
      }

      const { temp, origin, rpm, spunDown } = data;
      const ori = (origin ?? '').toString();
      const isCPU = /^cpu$/i.test(ori);

      let percent = null, html = '';
      if (spunDown) {
        if (origin === 'Idle') {
          const suffix = (snapDiskSelected && !snapCpuEnabled)
            ? '(All selected HDDs are spun down — using Idle Speed)'
            : '(No temperature source — using Idle Speed)';
          html = `Current: *°C (Idle) → RPM ${rpm}<br><span style="color:var(--fcp-text-muted);">${suffix}</span>`;
        } else {
          html = `Current: *°C (${origin}) → RPM ${rpm}<br>
                  <span style="color:var(--fcp-text-muted);">(${origin} is spun down — using rule's minimum temperature)</span>`;
        }
        vLine.style.display = hLine.style.display = dot.style.display = 'none';
      } else {
        const ds = origin === 'CPU' ? dsCPU : dsDisk;
        percent = pickPercentNearest(ds, temp);
        if (percent != null) {
          const pwm = Math.round(percent * 2.55);
          html = `Current: ${temp}°C (${origin}) → Fan Speed ${percent.toFixed(0)}% (PWM ${pwm}) → RPM ${rpm}`;

          const xScale = chart.scales.x;
          const yScale = chart.scales.y;
          const ca = chart.chartArea;

          let x = xScale.getPixelForValue(temp);
          let y = yScale.getPixelForValue(percent);

          const wb = wrapper.getBoundingClientRect();
          const cb = canvas.getBoundingClientRect();
          const offsetLeft = cb.left - wb.left;
          const offsetTop  = cb.top  - wb.top;

          x = Math.min(Math.max(x, ca.left),  ca.right);
          y = Math.min(Math.max(y, ca.top),   ca.bottom);

          vLine.style.left   = (offsetLeft + x) + 'px';
          vLine.style.top    = (offsetTop  + ca.top) + 'px';
          vLine.style.height = (ca.bottom - ca.top) + 'px';
          vLine.style.display = 'block';

          hLine.style.left   = (offsetLeft + ca.left) + 'px';
          hLine.style.top    = (offsetTop  + y) + 'px';
          hLine.style.width  = (ca.right - ca.left) + 'px';
          hLine.style.display = 'block';

          dot.style.left = (offsetLeft + x) + 'px';
          dot.style.top  = (offsetTop  + y) + 'px';
          dot.style.display = 'block';
        } else {
          html = `Current: ${temp ?? '*'}°C (${origin}) → RPM ${rpm}<br><span style="color:var(--fcp-text-muted);">(${origin} data not shown in chart)</span>`;
          vLine.style.display = hLine.style.display = dot.style.display = 'none';
        }
      }

      if (origin === 'CPU' && !snapCpuEnabled) {
        html += '<br><span style="color:var(--fcp-text-muted);">(CPU was disabled, still active until Apply)</span>';
      } else if (origin === 'Disk' && !snapDiskSelected) {
        html += '<br><span style="color:var(--fcp-text-muted);">(Disk was deselected, still active until Apply)</span>';
      }

      liveNote.innerHTML = html;
    }

    // First refresh immediately + every 5 seconds
    updateTopNote();
    if (window.__fanChartTimer) clearInterval(window.__fanChartTimer);
    window.__fanChartTimer = setInterval(updateTopNote, 5000);
  }, 10);
};

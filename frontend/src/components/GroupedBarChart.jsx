import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const GRID_COLOR = '#e5e7f2';
const AXIS_COLOR = '#d7dbec';
const TICK_COLOR = '#6b7086';

// Horizontal multi-series bar chart: one bar (or stacked bar) per
// primaryLabels category, one dataset per series. Used for both the
// dimension × dimension breakdown (stacked) and the All vs Filtered
// comparison (grouped). Colors are precomputed by the parent.
function GroupedBarChart({ primaryLabels, series, stacked }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { labels: [], datasets: [] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: GRID_COLOR },
            border: { color: AXIS_COLOR },
            ticks: { color: TICK_COLOR, precision: 0 },
          },
          y: {
            grid: { display: false },
            border: { color: AXIS_COLOR },
            ticks: { color: TICK_COLOR, autoSkip: false },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            align: 'start',
            labels: { color: TICK_COLOR, boxWidth: 12, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.x.toLocaleString()} records`,
            },
          },
        },
      },
    });
    return () => chartRef.current.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    chart.data.labels = primaryLabels;
    chart.data.datasets = series.map((s) => ({
      label: s.label,
      data: s.counts,
      backgroundColor: s.color,
      maxBarThickness: 18,
    }));
    chart.options.scales.x.stacked = stacked;
    chart.options.scales.y.stacked = stacked;
    chart.update();
  }, [primaryLabels, series, stacked]);

  const height = Math.max(240, primaryLabels.length * 30 + 72);

  return (
    <div className="chart-box" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label="Multi-series bar chart of record counts" />
    </div>
  );
}

export default GroupedBarChart;

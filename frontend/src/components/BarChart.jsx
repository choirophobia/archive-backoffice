import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const BAR_COLOR = '#4f46e5';
const GRID_COLOR = '#e5e7f2';
const AXIS_COLOR = '#d7dbec';
const TICK_COLOR = '#6b7086';

// Horizontal single-series bar chart of counts per category. Horizontal so
// long category labels stay readable; the box grows with the category count.
function BarChart({ labels, counts }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: BAR_COLOR,
            borderRadius: 6,
            maxBarThickness: 18,
          },
        ],
      },
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
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (ctx) => `${ctx.parsed.x.toLocaleString()} records`,
            },
          },
        },
      },
    });
    return () => chartRef.current.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    chart.data.labels = labels;
    chart.data.datasets[0].data = counts;
    chart.update();
  }, [labels, counts]);

  const height = Math.max(240, labels.length * 30 + 48);

  return (
    <div className="chart-box" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label="Bar chart of record counts" />
    </div>
  );
}

export default BarChart;

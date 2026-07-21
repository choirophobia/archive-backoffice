import { useEffect, useRef } from 'react';
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
} from 'chart.js';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler);

const LINE_COLOR = '#4f46e5';
const FILL_COLOR = 'rgba(79, 70, 229, 0.12)';
const GRID_COLOR = '#e5e7f2';
const AXIS_COLOR = '#d7dbec';
const TICK_COLOR = '#6b7086';

// Single-series line chart of monthly record counts.
function TrendChart({ labels, counts }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            borderColor: LINE_COLOR,
            backgroundColor: FILL_COLOR,
            fill: true,
            tension: 0.25,
            pointRadius: 3,
            pointBackgroundColor: LINE_COLOR,
            pointHoverRadius: 5,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
            border: { color: AXIS_COLOR },
            ticks: { color: TICK_COLOR },
          },
          y: {
            beginAtZero: true,
            grid: { color: GRID_COLOR },
            border: { color: AXIS_COLOR },
            ticks: { color: TICK_COLOR, precision: 0 },
          },
        },
        plugins: {
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y.toLocaleString()} records`,
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

  return (
    <div className="chart-box trend-box">
      <canvas ref={canvasRef} role="img" aria-label="Line chart of record counts by month" />
    </div>
  );
}

export default TrendChart;

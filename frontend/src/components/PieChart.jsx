import { useEffect, useRef } from 'react';
import { Chart, PieController, ArcElement, Tooltip } from 'chart.js';

Chart.register(PieController, ArcElement, Tooltip);

// Pie of category shares. Receives pre-folded slices ({label, count, color})
// from the parent, which also renders the matching percentage legend.
function PieChart({ slices }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    chartRef.current = new Chart(canvasRef.current, {
      type: 'pie',
      data: {
        labels: [],
        datasets: [
          {
            data: [],
            backgroundColor: [],
            // 2px surface gap between adjacent slices.
            borderColor: '#ffffff',
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            displayColors: false,
            callbacks: {
              label: (ctx) => {
                const total = ctx.dataset.data.reduce((sum, v) => sum + v, 0);
                const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : '0.0';
                return `${ctx.label}: ${ctx.parsed.toLocaleString()} (${pct}%)`;
              },
            },
          },
        },
      },
    });
    return () => chartRef.current.destroy();
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    chart.data.labels = slices.map((s) => s.label);
    chart.data.datasets[0].data = slices.map((s) => s.count);
    chart.data.datasets[0].backgroundColor = slices.map((s) => s.color);
    chart.update();
  }, [slices]);

  return (
    <div className="chart-box pie-box">
      <canvas ref={canvasRef} role="img" aria-label="Pie chart of record shares" />
    </div>
  );
}

export default PieChart;

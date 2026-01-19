import React from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

export default function TrendChartHeight({ points }) {
  if (!points || points.length < 2) {
    return <p>Not enough data for height trend.</p>;
  }

  const sorted = [...points].sort((a, b) => a.ageMonths - b.ageMonths);

  const data = {
    labels: sorted.map((p) => String(p.ageMonths)),
    datasets: [
      {
        label: "Height (cm)",
        data: sorted.map((p) => p.heightCm),
        tension: 0.25,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: { legend: { display: true } },
    scales: {
      x: { title: { display: true, text: "Age (months)" } },
      y: { title: { display: true, text: "Height (cm)" } },
    },
  };

  return <Line data={data} options={options} />;
}

import { z } from 'zod';
import { AgentTool } from '../types/index.js';

/**
 * Chart types supported by the graph tool
 */
export type ChartType = 'line' | 'bar' | 'pie' | 'scatter' | 'area' | 'histogram';

/**
 * Data point for charts
 */
export interface DataPoint {
  x: string | number;
  y: number;
  label?: string;
}

/**
 * Chart configuration
 */
export interface ChartConfig {
  title?: string;
  xLabel?: string;
  yLabel?: string;
  width?: number;
  height?: number;
  backgroundColor?: string;
  colorScheme?: string[];
}

/**
 * Creates a graph/chart tool that can visualize data
 * 
 * @param options - Configuration options for the graph tool
 * @returns An AgentTool instance for creating graphs
 */
export function createGraphTool(options?: {
  outputFormat?: 'svg' | 'html' | 'base64' | 'url';
  chartLibrary?: 'chartjs' | 'd3' | 'plotly';
  storagePath?: string;
}): AgentTool {
  const outputFormat = options?.outputFormat || 'html';
  const chartLibrary = options?.chartLibrary || 'chartjs';
  const storagePath = options?.storagePath || './charts';

  return {
    name: 'create_graph',
    description: 'Create charts and graphs from data. Call this tool with: data (array of {x, y} objects), chartType (bar/line/pie/scatter/area/histogram), and optional title. Example: data=[{x:"Q1",y:10},{x:"Q2",y:20}], chartType="bar", title="Sales".',
    parameters: z.object({
      data: z.array(z.object({
        x: z.union([z.string(), z.number()]).describe('X-axis value or label'),
        y: z.number().describe('Y-axis value'),
        label: z.string().optional().describe('Optional label for the data point'),
      })).describe('Array of data points to visualize'),
      chartType: z.enum(['line', 'bar', 'pie', 'scatter', 'area', 'histogram']).describe('Type of chart to create'),
      title: z.string().optional().describe('Chart title'),
      xLabel: z.string().optional().describe('X-axis label'),
      yLabel: z.string().optional().describe('Y-axis label'),
      width: z.number().optional().describe('Chart width in pixels (default: 800)'),
      height: z.number().optional().describe('Chart height in pixels (default: 400)'),
    }),
    handler: async (params: {
      data: DataPoint[];
      chartType: ChartType;
      title?: string;
      xLabel?: string;
      yLabel?: string;
      width?: number;
      height?: number;
    }) => {
      console.log('[createGraphTool] Received params:', JSON.stringify({ 
        dataLength: params.data?.length, 
        chartType: params.chartType, 
        title: params.title,
        sampleData: params.data?.slice(0, 2) 
      }, null, 2));
      
      // Validate and filter data
      if (!params.data || !Array.isArray(params.data) || params.data.length === 0) {
        console.warn('[createGraphTool] Invalid data:', { data: params.data, isArray: Array.isArray(params.data), length: params.data?.length });
        return {
          success: false,
          message: 'Data array is required and must contain at least one data point',
        };
      }
      
      // Filter out invalid data points
      const validData = params.data.filter((point: any, index: number) => {
        const hasX = point.x !== undefined && point.x !== null && String(point.x).trim() !== '';
        const hasY = typeof point.y === 'number' && !isNaN(point.y) && isFinite(point.y);
        if (!hasX || !hasY) {
          console.warn(`[createGraphTool] Filtering out invalid data point at index ${index}:`, point);
        }
        return hasX && hasY;
      });
      
      if (validData.length === 0) {
        console.warn('[createGraphTool] No valid data points after filtering:', params.data);
        return {
          success: false,
          message: 'No valid data points found. Each point must have x (label) and y (numeric value)',
        };
      }
      
      if (validData.length < params.data.length) {
        console.warn(`[createGraphTool] Filtered out ${params.data.length - validData.length} invalid data points`);
      }
      
      console.log(`[createGraphTool] Creating chart with ${validData.length} valid data points`);
      
      try {
        const chart = await generateChart({ ...params, data: validData }, {
          outputFormat,
          chartLibrary,
          storagePath,
        });
        
        console.log(`[createGraphTool] ✅ Generated ${outputFormat} chart (${chart.length} chars)`);
        return {
          success: true,
          chart: chart,
          format: outputFormat,
          message: `Chart created successfully as ${outputFormat}`,
        };
      } catch (error: any) {
        console.error('[createGraphTool] ❌ Error generating chart:', error);
        return {
          success: false,
          error: error.message,
          message: `Failed to create chart: ${error.message}`,
        };
      }
    },
  };
}

/**
 * Generate a chart based on the parameters
 */
async function generateChart(
  params: {
    data: DataPoint[];
    chartType: ChartType;
    title?: string;
    xLabel?: string;
    yLabel?: string;
    width?: number;
    height?: number;
  },
  options: {
    outputFormat: string;
    chartLibrary: string;
    storagePath: string;
  }
): Promise<string> {
  const { data, chartType, title, xLabel, yLabel, width = 800, height = 400 } = params;
  const { outputFormat, chartLibrary } = options;

  // Validate data
  if (!data || data.length === 0) {
    throw new Error('Data array cannot be empty');
  }

  // Generate chart based on library and format
  if (chartLibrary === 'chartjs' && outputFormat === 'html') {
    return generateChartJSHTML(data, chartType, { title, xLabel, yLabel, width, height });
  } else if (outputFormat === 'svg') {
    return generateSVG(data, chartType, { title, xLabel, yLabel, width, height });
  } else {
    // For other formats, return a simple representation
    return generateSimpleChart(data, chartType, { title, xLabel, yLabel });
  }
}

/**
 * Generate Chart.js HTML
 */
function generateChartJSHTML(
  data: DataPoint[],
  chartType: ChartType,
  config: ChartConfig
): string {
  // Generate unique chart ID using timestamp and random number to avoid conflicts
  const chartId = `chart_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const labels = data.map(d => String(d.x));
  const values = data.map(d => d.y);
  
  const chartConfig = {
    type: chartType === 'pie' ? 'pie' : chartType === 'bar' ? 'bar' : 'line',
    data: {
      labels: chartType === 'pie' ? labels : labels,
      datasets: [{
        label: config.title || 'Data',
        data: values,
        backgroundColor: getColorScheme(chartType, values.length),
        borderColor: '#3b82f6',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: !!config.title,
          text: config.title || '',
        },
        legend: {
          display: chartType === 'pie',
        },
      },
      scales: chartType !== 'pie' ? {
        x: {
          title: {
            display: !!config.xLabel,
            text: config.xLabel || '',
          },
          ticks: {
            maxRotation: 45,
            minRotation: 0,
            autoSkip: true,
            maxTicksLimit: 20,
            callback: function(value: any, index: number): string {
              const label = labels[index] || String(value);
              // Truncate very long labels
              if (label && label.length > 20) {
                return label.substring(0, 17) + '...';
              }
              return label;
            },
          },
        },
        y: {
          title: {
            display: !!config.yLabel,
            text: config.yLabel || '',
          },
        },
      } : undefined,
    },
  };

  // Return embeddable HTML (not full document) that can be inserted into the page
  // Chart.js should already be loaded in the page head
  // Use data attributes to store config for easier access when scripts don't execute
  // Encode as base64 to avoid HTML entity issues
  const chartConfigStr = Buffer.from(JSON.stringify(chartConfig)).toString('base64');
  return `
<div class="chart-wrapper" style="width: 100%; max-width: ${config.width || 800}px; margin: 0 auto;" data-chart-id="${chartId}" data-chart-config="${chartConfigStr}">
  <div style="width: 100%; height: ${config.height || 400}px; position: relative;">
    <canvas id="${chartId}"></canvas>
  </div>
  <script>
    (function() {
      const chartId = '${chartId}';
      const chartConfig = ${JSON.stringify(chartConfig)};
      let chartInitialized = false;
      let initAttempts = 0;
      const maxAttempts = 100; // Try for up to 5 seconds (100 * 50ms)
      
      // Wait for Chart.js to load if not already available
      function initChart() {
        initAttempts++;
        if (chartInitialized) return; // Prevent multiple initializations
        if (typeof Chart === 'undefined') {
          if (initAttempts < maxAttempts) {
            setTimeout(initChart, 50);
          } else {
            console.error('❌ Chart.js not loaded after', maxAttempts * 50, 'ms');
          }
          return;
        }
        const canvas = document.getElementById(chartId);
        if (!canvas) {
          if (initAttempts < maxAttempts) {
            setTimeout(initChart, 50);
          } else {
            console.error('❌ Canvas element not found:', chartId);
          }
          return;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            // Destroy existing chart if it exists
            const existingChart = Chart.getChart(canvas);
            if (existingChart) {
              existingChart.destroy();
            }
            const chart = new Chart(ctx, chartConfig);
            chartInitialized = true;
            console.log('✅ Chart initialized:', chartId, 'after', initAttempts, 'attempts');
          } catch (error) {
            console.error('❌ Error creating chart:', chartId, error);
            // Try again if not too many attempts
            if (initAttempts < maxAttempts) {
              setTimeout(initChart, 100);
            }
          }
        } else {
          if (initAttempts < maxAttempts) {
            setTimeout(initChart, 50);
          }
        }
      }
      
      // Try multiple initialization strategies
      if (typeof Chart !== 'undefined') {
        // Chart.js is ready, initialize immediately
        initChart();
      } else {
        // Wait for Chart.js to load
        const checkChart = setInterval(() => {
          if (typeof Chart !== 'undefined') {
            clearInterval(checkChart);
            initChart();
          } else if (initAttempts >= maxAttempts) {
            clearInterval(checkChart);
          }
        }, 50);
        // Also try after delays as fallback
        setTimeout(initChart, 100);
        setTimeout(initChart, 500);
        setTimeout(initChart, 1000);
        // Clean up interval after 5 seconds
        setTimeout(() => clearInterval(checkChart), 5000);
      }
    })();
  </script>
</div>`;
}

/**
 * Generate simple SVG chart
 */
function generateSVG(
  data: DataPoint[],
  chartType: ChartType,
  config: ChartConfig
): string {
  const width = config.width || 800;
  const height = config.height || 400;
  const padding = 60;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;
  
  const maxY = Math.max(...data.map(d => d.y));
  const minY = Math.min(...data.map(d => d.y));
  const rangeY = maxY - minY || 1;
  
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((d.y - minY) / rangeY) * chartHeight;
    return { x, y, value: d.y, label: String(d.x) };
  });

  let pathData = '';
  if (chartType === 'line' || chartType === 'area') {
    pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    if (chartType === 'area') {
      pathData += ` L ${points[points.length - 1].x} ${height - padding} L ${padding} ${height - padding} Z`;
    }
  }

  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="white"/>
  ${config.title ? `<text x="${width / 2}" y="30" text-anchor="middle" font-size="18" font-weight="bold">${config.title}</text>` : ''}
  ${points.map((p, i) => 
    chartType === 'line' || chartType === 'area' 
      ? `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#3b82f6"/>`
      : `<rect x="${p.x - 10}" y="${p.y}" width="20" height="${height - padding - p.y}" fill="#3b82f6"/>`
  ).join('')}
  ${pathData ? `<path d="${pathData}" stroke="#3b82f6" stroke-width="2" fill="${chartType === 'area' ? '#3b82f6' : 'none'}" opacity="${chartType === 'area' ? '0.3' : '1'}"/>` : ''}
  ${config.xLabel ? `<text x="${width / 2}" y="${height - 10}" text-anchor="middle" font-size="12">${config.xLabel}</text>` : ''}
  ${config.yLabel ? `<text x="15" y="${height / 2}" text-anchor="middle" font-size="12" transform="rotate(-90, 15, ${height / 2})">${config.yLabel}</text>` : ''}
</svg>`;
}

/**
 * Generate simple text-based chart representation
 */
function generateSimpleChart(
  data: DataPoint[],
  chartType: ChartType,
  config: ChartConfig
): string {
  const maxY = Math.max(...data.map(d => d.y));
  const chart = data.map(d => {
    const barLength = Math.round((d.y / maxY) * 50);
    const bar = '█'.repeat(barLength);
    return `${String(d.x).padEnd(20)} ${bar} ${d.y}`;
  }).join('\n');

  return `
${config.title ? `${config.title}\n` : ''}${'='.repeat(80)}
${config.yLabel || 'Value'} →
${chart}
${config.xLabel ? `\n${config.xLabel}` : ''}
`;
}

/**
 * Get color scheme for charts
 */
function getColorScheme(chartType: ChartType, dataLength: number): string | string[] {
  if (chartType === 'pie' && dataLength > 1) {
    const colors = [
      '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
    ];
    return Array.from({ length: dataLength }, (_, i) => colors[i % colors.length]);
  }
  return '#3b82f6';
}


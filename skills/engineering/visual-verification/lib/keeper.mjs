const { url, width, height } = JSON.parse(process.argv[2]);
const ws = new WebSocket(url);
ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Emulation.setDeviceMetricsOverride', params: { width, height, deviceScaleFactor: 0, mobile: false } }));
ws.onclose = () => process.exit(0);
ws.onerror = () => process.exit(1);

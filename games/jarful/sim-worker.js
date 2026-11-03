// JARFUL physics worker: runs sim.js off the main thread so dropping/pouring never stalls rendering or orbiting,
// and keeps going (at full speed) while the tab is hidden.
import { Runner } from './sim.js';

const runner = new Runner(snap => postMessage({ t: 'snap', ...snap }, [snap.buf.buffer]));
onmessage = ({ data: m }) => {
  if (m.t === 'start') runner.start(m.cfg);
  else if (m.t === 'pour') runner.pour(m.on);
  else if (m.t === 'finish') runner.finish();
  else if (m.t === 'fast') { runner.fast = m.on; runner.wake(); }
  else if (m.t === 'stop') runner.stop();
};
postMessage({ t: 'ready' });

import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { register as registerSW } from './serviceWorkerRegistration';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
)

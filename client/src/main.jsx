// 应用入口：挂载 React 根组件到 DOM
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// StrictMode 在开发环境下会双重渲染以检测副作用
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

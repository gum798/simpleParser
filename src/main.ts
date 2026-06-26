import './styles.css';
import { mountApp } from './ui';

const toolbar = document.getElementById('toolbar');
const editorHost = document.getElementById('editor');
const panel = document.getElementById('panel');
const status = document.getElementById('status');
const toast = document.getElementById('toast');

if (toolbar && editorHost && panel && status && toast) {
  mountApp({ toolbar, editorHost, panel, status, toast });
}

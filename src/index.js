import React from 'react';
import ReactDOM from 'react-dom';

import { LocaleProvider } from 'antd';
import zh_CN from 'antd/lib/locale-provider/zh_CN';
import 'moment/locale/zh-cn';


import './index.css';
import App from './App';
// import registerServiceWorker from './registerServiceWorker';

import { Provider } from 'react-redux';
import { createStore } from 'redux';

const userReducer = (state, action) => {
	if (!state) return {
		username: sessionStorage.getItem('username'),
		userToken: sessionStorage.getItem('userToken')
	}
	switch (action.type) {
		case 'login':
			return { ...state, username: action.username, userToken: action.userToken }
		case 'logout':
			return { ...state, username: '', userToken: '' }
		default:
			return state
	}
}
const store = createStore(userReducer)
ReactDOM.render( <LocaleProvider locale={zh_CN}><Provider store={store}><App /></Provider></LocaleProvider>, document.getElementById('root'));
// registerServiceWorker();

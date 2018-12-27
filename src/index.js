import React from 'react';
import ReactDOM from 'react-dom';

import { LocaleProvider } from 'antd';
import zh_CN from 'antd/lib/locale-provider/zh_CN';
import 'moment/locale/zh-cn';


import './index.css';
import App from './App';
// import registerServiceWorker from './registerServiceWorker';

import { Provider } from 'react-redux';
import { createStore, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';
import actions from './actions'
const reducer = (state, action) => {
	if (!state) return {
		username: sessionStorage.getItem('username'),
		userToken: sessionStorage.getItem('userToken')
	}
	if(actions[action.type]) {
		return actions[action.type](state,action);
	} else {
		return state;
	}	
}
const store = createStore(reducer,applyMiddleware(thunk))
ReactDOM.render( <LocaleProvider locale={zh_CN}><Provider store={store}><App /></Provider></LocaleProvider>, document.getElementById('root'));
// registerServiceWorker();

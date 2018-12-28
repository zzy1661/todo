import React from 'react';
import ReactDOM from 'react-dom';

import { Provider } from 'react-redux';
import store from './reducer';
import { createBrowserHistory } from 'history'


import { LocaleProvider } from 'antd';
import zh_CN from 'antd/lib/locale-provider/zh_CN';
import 'moment/locale/zh-cn';

import './index.css';
import App from './App';

const history = createBrowserHistory()


ReactDOM.render( <LocaleProvider locale={zh_CN}><Provider store={store}>
	
	  <App history={history}/>
	
	</Provider></LocaleProvider>, document.getElementById('root'));

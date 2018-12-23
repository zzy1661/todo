import React, {
	Component
} from 'react';
import './App.css';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';

import Login from './containers/Login';
import Index from './containers/index';
// import { hot } from 'react-hot-loader';


/* import { Provider } from 'react-redux';
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
const store = createStore(userReducer) */

class App extends Component {

	render() {
		return (
			<Router>
				<Switch>
					<Route path="/login" component={Login} />
					<Redirect exact from="/" to="/general" />
					<Route path="/general" component={Index} />
					<Route path="/workbench" component={Index}></Route>
					<Route path="/statistics" component={Index}></Route>
					<Redirect to="/login" />
				</Switch>
			</Router>
		);
	}
}

// export default <Provider store={store}><App /></Provider>;
export default App;
import React, {
	Component
} from 'react';
import './App.css';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';

import Login from './pages/login';
import Index from './pages/index';
import { hot } from 'react-hot-loader';
class App extends Component {

	render() {
		return(
			<Router>
				<Switch>
	        		{/* <Route exact path="/" render={ ()=> ( <Redirect to="/login" />)} /> */}
					<Route path="/login" component={Login} />
					<Redirect exact from="/" to="/general" />
					<Route path="/general" component={Index} />
					<Route path="/workbench" component={ Index }></Route>
					<Route path="/statistics" component={ Index }></Route>
					<Redirect to="/login" />
				</Switch>
	      </Router>
		);
	}
}

export default hot(module)(App)
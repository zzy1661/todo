import React, {
	Component
} from 'react';
import './App.css';
import { HashRouter as Router, Route, Link, Switch, Redirect } from 'react-router-dom';

import Login from './pages/login';
import Index from './pages/index';

class App extends Component {
	constructor(props) {
		super(props);

	}

	render() {
		return(
			<Router>
				<Switch>
	        		<Route exact path="/" render={ ()=> ( <Redirect to="/login" />)} />
					<Route path="/login" component={Login} />
					<Route path="/index" component={Index} />
					<Redirect to="/login" />
				</Switch>
	      </Router>
		);
	}
}

export default App;
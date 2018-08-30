import React, {
	Component
} from 'react';
import './App.css';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';

import Login from './pages/login';
import Index from './pages/index';

class App extends Component {

	render() {
		return(
			<Router>
				<Switch>
	        		<Route exact path="/" render={ ()=> ( <Redirect to="/login" />)} />
					<Route path="/login" component={Login} />
					<Route path="/index" component={Index} />
					
				</Switch>
	      </Router>
		);
	}
}

export default App;
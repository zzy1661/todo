import React, {
	Component
} from 'react';
import './App.css';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';

import { ConnectedRouter } from 'connected-react-router'
import PropTypes from 'prop-types'

import Login from './containers/Login';
import Index from './containers/index';


class App extends Component {
	static propTypes = {
		history: PropTypes.object,
	  }
	render() {
		console.log(111,this.props.history)
		return (
			<ConnectedRouter history={this.props.history}>
				<Switch>
					<Route path="/login" component={Login} />
					<Redirect exact from="/" to="/general" />
					<Route path="/general" component={Index} />
					<Route path="/workbench" component={Index}></Route>
					<Route path="/statistics" component={Index}></Route>
					<Redirect to="/login" />
				</Switch>
			</ConnectedRouter>
		);
	}
}
export default App;
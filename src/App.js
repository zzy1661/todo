import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { ConnectedRouter } from 'connected-react-router'
import routes from './routes'

import './App.css';

class App extends Component {
	static propTypes = {
		history: PropTypes.object,
	  }
	render() {
		
		return (
			<ConnectedRouter history={history}>
			  { routes }
			</ConnectedRouter>
		  )
	}
}
export default App;



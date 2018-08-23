import React, { Component } from 'react';
import logo from './logo.svg';
import './App.css';

class App extends Component {
	constructor(props) {
    super(props);
    this.state = {imgBgStyle: {
    	display: 'none'
    }};
  }
	componentWillMount() {
      const img = new Image()
    	img.src = 'https://placeimg.com/1920/1080/any';
    	img.onload = () => {
    		this.setState({imgBgStyle: {
    			display: 'block',
    			height: '100%',
					background: 'url("https://placeimg.com/1920/1080/any") 100% 100%/cover no-repeat'
    		}});
    	}
  }
	 componentDidMount() {
    
  }
  render() {
    return (
      <div className="login-wrapper" >
        <div className="login-bg-img" style={this.state.imgBgStyle}></div>
        <div className="login-panel">
        	<h1 className="login-logo">TODO</h1>
        </div>
      </div>
    );
  }
}

export default App;

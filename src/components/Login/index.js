import React, {
	Component
} from 'react';
import PropTypes from 'prop-types'

import { Form, Input, Button } from 'antd';

import './index.css';
const FormItem = Form.Item;
class Login extends Component {
	static propTypes = {
		username: PropTypes.string,
		userToken: PropTypes.string,
		onLogin: PropTypes.func
	  }

	constructor(props) {
		super(props);
		this.state = {
			imgBgStyle: {
				display: 'none'
			},
			username: '',
			password: '',
		};
	}

	componentDidMount() {

		/* if (this.props.username && this.props.userToken) {
			this.props.history.push('/');
		} */

		const img = new Image()
		img.src = 'https://placeimg.com/1920/1080/any';
		img.onload = () => {
			this.setState({
				imgBgStyle: {
					display: 'block',
					height: '100%',
					background: `url(${img.src}) 50% 50%/cover no-repeat`
				}
			});
		}
	}

	login = () => {
		var {username,password} = this.state;
		fetch('http://localhost:8082/login', {
			method: 'POST',
			headers: { 
				'Content-Type': 'application/x-www-form-urlencoded'
		 	},
			body: `username=${username}&password=${password}`
		}).then((res) => {
			return res.json();
		}).then((data) => {
			if (data.code === 0) {				
				// this.handleLogined(username,data.data.token)
				this.props.history.push('/');
				
			}
		})
	}
	handleLogined =(username,token) =>{
		if (this.props.onLogin) {
		  this.props.onLogin(username,token)
		}
	  }
	setUsername = (e) => {
		let username = e.target.value;
		this.setState({
			username
		})
	}
	setPw = (e) => {
		let password = e.target.value;
		this.setState({
			password
		})
	}
	render() {
		return (
			<div className="login-wrapper" >
				<div className="login-bg-img" style={this.state.imgBgStyle}></div>
				<div className="login-panel">
					<h1 className="login-logo">TODO</h1>
					<Form layout="vertical" >
						<FormItem>
							<Input placeholder="用户名" onChange={this.setUsername} />
						</FormItem>
						<FormItem>
							<Input placeholder="密码" type="password" onChange={this.setPw} />
						</FormItem>
						<FormItem>
							<Button type="primary" block onClick={this.login}>Start!</Button>
						</FormItem>
					</Form>
				</div>
			</div>
		);
	}
}

export default Login;
import React, {
	Component
} from 'react';
import { Form, Input, Button } from 'antd';

import './index.css';
const FormItem = Form.Item;
class Login extends Component {
	constructor(props) {
		super(props);
		this.state = {
			imgBgStyle: {
				display: 'none'
			}
		};
	}
	componentDidMount() {
		const img = new Image()
		img.src = 'https://placeimg.com/1920/1080/any';
		img.onload = () => {
			this.setState({
				imgBgStyle: {
					display: 'block',
					height: '100%',
					background: `url(${img.src}) 50% 50%/cover no-repeat`
    		}});
    	}
  	}
	 componentDidMount() {
    
	}
	login = () => {
		fetch('https://easy-mock.com/mock/5b8baba761840c7b4033654b/todo/login', {
			method: 'POST'
		}).then((res)=>{
			return res.json();
		}).then((data)=>{
			if(data.code === 1) {
				sessionStorage.setItem('user','user');
				console.log(this.props);
        		this.props.history.push('/');
			}
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
						<Input placeholder="用户名" />
					</FormItem>
					<FormItem>
						<Input placeholder="密码" type="password"/>
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
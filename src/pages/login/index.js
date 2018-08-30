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
	componentWillMount() {
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
		console.log(this.props);
        this.props.history.push('/index');
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
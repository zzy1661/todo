import React, { Component } from 'react';
import { Layout, Menu, Avatar  } from 'antd';
import { Route, NavLink, Switch, Redirect } from 'react-router-dom';
import General from '../general';
import Workbench from '../workbench'
import Statistics from '../statistics';
import EditTask from '../editTask';
import Timer from '../../components/timer';
import './index.css';
const { Header, Content, Footer } = Layout;

class Index extends Component {
	
  componentDidMount() {
    console.log(this.props)
  }
  render() {
   
    return (
      <Layout className="layout index">
        <Header>
          <div className="logo">TODO</div>
          <Menu
            theme="dark"
            mode="horizontal"
            defaultSelectedKeys={[]}
            style={{ lineHeight: '64px' }}
          >
            <Menu.Item key="1"><NavLink to="/general" >一览</NavLink></Menu.Item>
            <Menu.Item key="2"><NavLink to="/workbench" >工作台</NavLink></Menu.Item>
            <Menu.Item key="3"><NavLink to="/statistics" >统计</NavLink></Menu.Item>
            <Menu.Item key="5" className="float-right">
              <Avatar src="http://placeimg.com/60/60/any" />
            </Menu.Item>
            <Menu.Item key="4" className="float-right"><Timer/></Menu.Item>
          </Menu>
        </Header>
        <Content className="content">
          <Switch>
            <Redirect exact from="/" to="/general" />
            <Route path="/general" component={ General } />
            <Route path="/workbench" component={ Workbench } />
            <Route path="/statistics" component={ Statistics } />
          </Switch>
        </Content>
        <Footer className="footer">
          TODO ©2018 Created by Zachary Zhou
          <address>
            github: <a href="https://github.com/zzy1661/todo">https://github.com/zzy1661/todo</a>
          </address>
        </Footer>
      </Layout>
    );
  }
}

export default Index;


import React, { Component } from 'react';
import { Layout, Menu, Avatar  } from 'antd';
import { Route, Link, Switch, Redirect } from 'react-router-dom';
import General from '../general';
import Workbench from '../workbench'
import Statistics from '../statistics';
import EditTask from '../editTask';
import Timer from '../../components/timer';
import './index.css';
const { Header, Content, Footer } = Layout;

class Index extends Component {
	
  render() {
    return (
      <Layout className="layout index">
        <Header>
          <div className="logo">TODO</div>
          <Menu
            theme="dark"
            mode="horizontal"
            defaultSelectedKeys={['1']}
            style={{ lineHeight: '64px' }}
          >
            <Menu.Item key="1"><Link to="/general">一览</Link></Menu.Item>
            <Menu.Item key="2"><Link to="/workbench">工作台</Link></Menu.Item>
            <Menu.Item key="3"><Link to="/statistics">统计</Link></Menu.Item>
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
            <Route path="/workbench" exact component={ Workbench }></Route>
            <Route path="/statistics" component={ Statistics }></Route>
            <Route path="/edit/:taskId" exact component={ EditTask }></Route>
            <Route path="/create" exact component={ Statistics }></Route>
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


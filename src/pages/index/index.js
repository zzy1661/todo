import React, { Component } from 'react';
import { Layout, Menu, Avatar  } from 'antd';
import { Route, Link, Switch, Redirect } from 'react-router-dom';
import General from '../general';
import Workbench from '../workbench'
import Statistics from '../statistics';
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
            <Menu.Item key="1"><Link to="/index/general">一览</Link></Menu.Item>
            <Menu.Item key="2"><Link to="/index/workbench">工作台</Link></Menu.Item>
            <Menu.Item key="3"><Link to="/index/statistics">统计</Link></Menu.Item>
            <Menu.Item key="5" className="float-right">
              <Avatar src="http://placeimg.com/60/60/any" />
            </Menu.Item>
            <Menu.Item key="4" className="float-right"><Timer/></Menu.Item>
          </Menu>
        </Header>
        <Content className="content">
          <Switch>
            <Redirect exact from="/index" to="/index/general" />
            <Route path="/index/general" component={ General } />
            <Route path="/index/workbench" component={ Workbench }></Route>
            <Route path="/index/statistics" component={ Statistics }></Route>
            <Route path="/index/edit/:taskId" component={ Statistics }></Route>
            <Route path="/index/create" component={ Statistics }></Route>
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


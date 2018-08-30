import React, { Component } from 'react';
import { Layout, Menu } from 'antd';
import General from '../general';
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
            defaultSelectedKeys={['2']}
            style={{ lineHeight: '64px' }}
          >
            <Menu.Item key="1">一览</Menu.Item>
            <Menu.Item key="2">工作台</Menu.Item>
            <Menu.Item key="3">统计</Menu.Item>
            <Menu.Item key="4">时间</Menu.Item>
            <Menu.Item key="5">用户</Menu.Item>
          </Menu>
        </Header>
        <Content className="content">
          <General></General>
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


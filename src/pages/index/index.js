import React, { Component } from 'react';
import { Layout, Menu, Breadcrumb } from 'antd';
import './index.css';
const { Header, Content, Footer } = Layout;

class Index extends Component {
	constructor(props) {
    super(props);
   
  }
	
  render() {
    return (
      <Layout className="layout index">
        <Header>
          <div className="logo" />
          <Menu
            theme="dark"
            mode="horizontal"
            defaultSelectedKeys={['2']}
            style={{ lineHeight: '64px' }}
          >
            <Menu.Item key="1">nav 1</Menu.Item>
            <Menu.Item key="2">nav 2</Menu.Item>
            <Menu.Item key="3">nav 3</Menu.Item>
          </Menu>
        </Header>
        <Content style={{ padding: '0 50px' }}>
          
        </Content>
        <Footer style={{ textAlign: 'center' }}>
          Ant Design ©2018 Created by Ant UED
        </Footer>
      </Layout>
    );
  }
}

export default Index;


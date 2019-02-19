import React, { Component } from 'react';
import { Menu, Icon } from 'antd';

import { Route, Link, Switch, Redirect, withRouter } from 'dva/router';
import './General.css';
const SubMenu = Menu.SubMenu;
const MenuItemGroup = Menu.ItemGroup;

class General extends Component {
  state = {
    current: 'all',
  }
  componentDidMount() {
    this.setActiveMenu();
  }

  setActiveMenu = () => {
    var loca = this.props.location.pathname;
    var current = loca.match(/\/(\w+)$/)[1];
    this.setState({
      current
    })
  }
  handleClick = (e) => {
    this.setState({
      current: e.key,
    });
  }

  render() {
    return (
      <div>
        <Menu
          onClick={this.handleClick}
          selectedKeys={[this.state.current]}
          className="nav-plans"
          mode="horizontal"
        >
          <Menu.Item key="all">
            <Icon type="file-text" /><Link to="/general/all">所有任务</Link>
          </Menu.Item>
          <Menu.Item key="finished" >
            <Link to="/general/finished"> <Icon type="check-square-o" />已完成</Link>
          </Menu.Item>
          <Menu.Item key="todo" >
            <Icon type="clock-circle-o" /><Link to="/general/todo">未完成</Link>
          </Menu.Item>
        </Menu>
        <div className="plan-panel">
            {this.props.children}
        </div>
      </div>
    );
  }
}

export default withRouter(General);